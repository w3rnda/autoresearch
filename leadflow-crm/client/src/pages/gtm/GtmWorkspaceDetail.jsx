import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { gtmApi } from '../../api/gtm.api'
import Button from '../../components/ui/Button'
import Badge from '../../components/ui/Badge'
import Spinner from '../../components/ui/Spinner'
import {
  ArrowLeft, Play, Search, Globe, Users, TrendingUp, Zap,
  CheckCircle, XCircle, Clock, Rocket, ExternalLink, Mail,
  Phone, MapPin, Star, ChevronUp, Sparkles, Brain, AtSign,
  Radar, Send, Activity, Flame,
} from 'lucide-react'

const SIGNAL_LABELS = {
  REVIEW_GROWTH: 'Review Growth',
  RATING_CHANGE: 'Rating Change',
  NEW_LOCATION: 'New Location',
  HIRING_SIGNAL: 'Hiring',
  TECH_ADOPTION: 'Tech Adoption',
  FUNDING_EVENT: 'Funding',
  WEBSITE_CHANGE: 'New Website',
  SOCIAL_GROWTH: 'Social Growth',
  CONTENT_PUBLISHED: 'New Content',
  CUSTOM: 'Signal',
}

const STATUS_COLORS = {
  NEW: 'blue',
  ENRICHING: 'yellow',
  ENRICHED: 'purple',
  SCORED: 'indigo',
  PROMOTED: 'green',
  REJECTED: 'red',
  DUPLICATE: 'gray',
}

const RUN_STATUS_COLORS = {
  RUNNING: 'yellow',
  COMPLETED: 'green',
  FAILED: 'red',
  CANCELLED: 'gray',
}

export default function GtmWorkspaceDetail() {
  const { workspaceId } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [showSourcing, setShowSourcing] = useState(false)
  const [entityFilter, setEntityFilter] = useState('')

  const { data: wsData, isLoading: wsLoading } = useQuery({
    queryKey: ['gtm-workspace', workspaceId],
    queryFn: () => gtmApi.getWorkspace(workspaceId).then(r => r.data.data),
  })

  const { data: entitiesData, isLoading: entitiesLoading } = useQuery({
    queryKey: ['gtm-entities', workspaceId, entityFilter],
    queryFn: () => gtmApi.listEntities(workspaceId, {
      ...(entityFilter && { status: entityFilter }),
      limit: 100,
    }).then(r => r.data),
  })

  const { data: runsData } = useQuery({
    queryKey: ['gtm-runs', workspaceId],
    queryFn: () => gtmApi.listSourcingRuns(workspaceId).then(r => r.data),
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
  })

  const activateMutation = useMutation({
    mutationFn: () => gtmApi.activateWorkspace(workspaceId),
    onSuccess: () => {
      toast.success('Workspace activated — sourcing queued')
      queryClient.refetchQueries({ queryKey: ['gtm-workspace', workspaceId] })
      queryClient.refetchQueries({ queryKey: ['gtm-runs', workspaceId] })
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed to activate workspace'),
  })

  const promoteMutation = useMutation({
    mutationFn: (entityId) => gtmApi.promoteEntity(workspaceId, entityId),
    onSuccess: () => {
      toast.success('Promoted to a CRM lead')
      queryClient.refetchQueries({ queryKey: ['gtm-entities', workspaceId] })
      queryClient.refetchQueries({ queryKey: ['gtm-workspace', workspaceId] })
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed to promote entity'),
  })

  const scoreAllMutation = useMutation({
    mutationFn: (autoPromote) => gtmApi.scoreWorkspace(workspaceId, { autoPromote }),
    onSuccess: (_res, autoPromote) => {
      toast.success(autoPromote
        ? 'Scoring + auto-promote queued — refreshing shortly'
        : 'AI scoring queued — scores will appear shortly')
      // Poll for score updates
      setTimeout(() => {
        queryClient.refetchQueries({ queryKey: ['gtm-entities', workspaceId] })
        queryClient.refetchQueries({ queryKey: ['gtm-workspace', workspaceId] })
      }, 3000)
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed to start scoring'),
  })

  const scoreEntityMutation = useMutation({
    mutationFn: (entityId) => gtmApi.scoreEntity(workspaceId, entityId, { autoPromote: false }),
    onSuccess: () => {
      toast.success('Scoring queued for entity')
      setTimeout(() => {
        queryClient.refetchQueries({ queryKey: ['gtm-entities', workspaceId] })
      }, 2000)
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed to score entity'),
  })

  const findEmailsMutation = useMutation({
    mutationFn: (entityId) => gtmApi.findEntityEmails(workspaceId, entityId),
    onSuccess: (res) => {
      const n = res?.data?.data?.emails?.length || 0
      toast.success(n > 0 ? `Found ${n} email(s)` : 'Email search complete')
      queryClient.refetchQueries({ queryKey: ['gtm-entities', workspaceId] })
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Email search failed'),
  })

  // ── Signal Engine ──────────────────────────────────────────────────────
  const { data: signalsData } = useQuery({
    queryKey: ['gtm-signals', workspaceId],
    queryFn: () => gtmApi.listSignals(workspaceId, { limit: 50 }).then(r => r.data),
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
  })

  const detectSignalsMutation = useMutation({
    mutationFn: () => gtmApi.detectSignals(workspaceId),
    onSuccess: () => {
      toast.success('Snapshot + signal detection queued')
      setTimeout(() => {
        queryClient.refetchQueries({ queryKey: ['gtm-signals', workspaceId] })
        queryClient.refetchQueries({ queryKey: ['gtm-entities', workspaceId] })
      }, 4000)
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed to detect signals'),
  })

  const scanMutation = useMutation({
    mutationFn: () => gtmApi.scanWorkspace(workspaceId),
    onSuccess: () => {
      toast.success('Full scan queued — re-sourcing + detecting signals')
      setTimeout(() => {
        queryClient.refetchQueries({ queryKey: ['gtm-signals', workspaceId] })
        queryClient.refetchQueries({ queryKey: ['gtm-runs', workspaceId] })
      }, 4000)
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed to start scan'),
  })

  const [outreachModal, setOutreachModal] = useState(null) // entity object or null

  if (wsLoading) {
    return <div className="flex items-center justify-center h-64"><Spinner size="lg" /></div>
  }

  if (!wsData) {
    return <div className="p-6 text-center text-gray-500">Workspace not found</div>
  }

  const entities = entitiesData?.data || []
  const runs = runsData?.data || []
  const signals = signalsData?.data || []
  const statusBreakdown = wsData.entityStatusBreakdown || {}

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Back + header */}
      <button
        onClick={() => navigate('/gtm')}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 mb-4 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Workspaces
      </button>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
            {wsData.name}
            <Badge variant={STATUS_COLORS[wsData.status] || 'gray'}>{wsData.status}</Badge>
          </h1>
          {wsData.icpNatural && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-2xl">{wsData.icpNatural}</p>
          )}
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          {wsData.status === 'DRAFT' && (
            <Button
              onClick={() => activateMutation.mutate()}
              loading={activateMutation.isPending}
            >
              <Play className="h-4 w-4" /> Activate
            </Button>
          )}
          <Button
            variant="primary"
            onClick={() => scoreAllMutation.mutate(false)}
            loading={scoreAllMutation.isPending}
            title="Run Claude AI scoring on all entities in this workspace"
          >
            <Brain className="h-4 w-4" /> Score with AI
          </Button>
          {wsData.autoPromoteThreshold > 0 && (
            <Button
              variant="success"
              onClick={() => scoreAllMutation.mutate(true)}
              loading={scoreAllMutation.isPending}
              title={`Score and auto-promote entities scoring >= ${wsData.autoPromoteThreshold}`}
            >
              <Sparkles className="h-4 w-4" /> Score + Auto-Promote
            </Button>
          )}
          <Button
            variant="primary"
            onClick={() => detectSignalsMutation.mutate()}
            loading={detectSignalsMutation.isPending}
            title="Snapshot entities and detect intent signals (review growth, new website, etc.)"
          >
            <Radar className="h-4 w-4" /> Detect Signals
          </Button>
          <Button
            variant="secondary"
            onClick={() => scanMutation.mutate()}
            loading={scanMutation.isPending}
            title="Full periodic scan: re-source fresh data + snapshot + detect signals"
          >
            <Activity className="h-4 w-4" /> Run Scan
          </Button>
          <Button variant="secondary" onClick={() => setShowSourcing(true)}>
            <Search className="h-4 w-4" /> Run Search
          </Button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <StatCard label="Total Entities" value={wsData._count?.entities || 0} icon={Users} />
        <StatCard label="New" value={statusBreakdown.NEW || 0} icon={Zap} color="blue" />
        <StatCard label="Enriched" value={statusBreakdown.ENRICHED || 0} icon={Globe} color="purple" />
        <StatCard label="Promoted" value={statusBreakdown.PROMOTED || 0} icon={CheckCircle} color="green" />
        <StatCard label="Signals" value={wsData._count?.signals || 0} icon={TrendingUp} color="amber" />
      </div>

      {/* Intent Signals — hot leads showing buying behaviour */}
      {signals.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 uppercase tracking-wide flex items-center gap-2">
            <Flame className="h-4 w-4 text-orange-500" /> Intent Signals
            <span className="text-xs font-normal text-gray-400 normal-case">— businesses actively growing &amp; investing</span>
          </h2>
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-orange-200 dark:border-orange-900/40 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-orange-50/60 dark:bg-orange-900/10">
                <tr>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase">Business</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase">Signal</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase">What Happened</th>
                  <th className="text-center px-4 py-2.5 text-xs font-medium text-gray-500 uppercase">Strength</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500 uppercase">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {signals.slice(0, 15).map((sig) => (
                  <tr key={sig.id} className="hover:bg-orange-50/40 dark:hover:bg-orange-900/10">
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-gray-900 dark:text-white truncate max-w-[180px]">{sig.entity?.name || '-'}</p>
                      {sig.entity?.gtmScore > 0 && (
                        <p className="text-[11px] text-gray-400">score {sig.entity.gtmScore}</p>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge variant="warning">{SIGNAL_LABELS[sig.type] || sig.type}</Badge>
                    </td>
                    <td className="px-4 py-2.5 text-gray-600 dark:text-gray-300 text-xs max-w-[320px]">{sig.description}</td>
                    <td className="px-4 py-2.5 text-center">
                      <span className="inline-block px-2 py-0.5 rounded-md text-xs font-bold text-orange-700 bg-orange-100 dark:bg-orange-900/30 dark:text-orange-300">
                        {sig.strength}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {sig.entity && (
                        <Button
                          variant="primary"
                          size="xs"
                          onClick={() => setOutreachModal(sig.entity)}
                          title="Generate signal-driven outreach"
                        >
                          <Send className="h-3 w-3" /> Outreach
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Sourcing Runs */}
      {runs.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 uppercase tracking-wide">Recent Sourcing Runs</h2>
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900/50">
                <tr>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase">Query</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="text-center px-4 py-2.5 text-xs font-medium text-gray-500 uppercase">Found</th>
                  <th className="text-center px-4 py-2.5 text-xs font-medium text-gray-500 uppercase">New</th>
                  <th className="text-center px-4 py-2.5 text-xs font-medium text-gray-500 uppercase">Dupes</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase">Started</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {runs.slice(0, 5).map((run) => (
                  <tr key={run.id} className="hover:bg-gray-50 dark:hover:bg-gray-900/30">
                    <td className="px-4 py-2.5 font-medium text-gray-900 dark:text-white truncate max-w-[200px]">{run.query || '-'}</td>
                    <td className="px-4 py-2.5"><Badge variant={RUN_STATUS_COLORS[run.status]}>{run.status}</Badge></td>
                    <td className="px-4 py-2.5 text-center">{run.entitiesFound}</td>
                    <td className="px-4 py-2.5 text-center text-green-600 font-medium">{run.entitiesNew}</td>
                    <td className="px-4 py-2.5 text-center text-gray-400">{run.entitiesDuplicate}</td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs">{new Date(run.startedAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Entities table */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">Discovered Entities</h2>
          <div className="flex gap-1">
            {['', 'NEW', 'ENRICHED', 'PROMOTED'].map((f) => (
              <button
                key={f}
                onClick={() => setEntityFilter(f)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  entityFilter === f
                    ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300'
                    : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                {f || 'All'}
              </button>
            ))}
          </div>
        </div>

        {entitiesLoading ? (
          <div className="flex justify-center py-10"><Spinner /></div>
        ) : entities.length === 0 ? (
          <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
            <Search className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 dark:text-gray-400">No entities yet. Run a search to discover businesses.</p>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900/50">
                <tr>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase">Business</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase">Contact</th>
                  <th className="text-center px-4 py-2.5 text-xs font-medium text-gray-500 uppercase">Score</th>
                  <th className="text-center px-4 py-2.5 text-xs font-medium text-gray-500 uppercase">Signals</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {entities.map((entity) => (
                  <EntityRow
                    key={entity.id}
                    entity={entity}
                    onPromote={() => promoteMutation.mutate(entity.id)}
                    onScore={() => scoreEntityMutation.mutate(entity.id)}
                    onFindEmails={() => findEmailsMutation.mutate(entity.id)}
                    promoting={promoteMutation.isPending}
                    scoring={scoreEntityMutation.isPending}
                    findingEmails={findEmailsMutation.isPending}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Sourcing modal */}
      {showSourcing && (
        <SourcingModal
          workspaceId={workspaceId}
          onClose={() => setShowSourcing(false)}
        />
      )}

      {/* Outreach modal */}
      {outreachModal && (
        <OutreachModal
          workspaceId={workspaceId}
          entity={outreachModal}
          onClose={() => setOutreachModal(null)}
        />
      )}
    </div>
  )
}

function OutreachModal({ workspaceId, entity, onClose }) {
  const [channel, setChannel] = useState('email')
  const [senderOffer, setSenderOffer] = useState('marketing and customer-response services')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  async function handleGenerate() {
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const res = await gtmApi.generateOutreach(workspaceId, entity.id, { channel, senderOffer })
      setResult(res.data.data)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to generate outreach')
    } finally {
      setLoading(false)
    }
  }

  function copyToClipboard() {
    const text = result?.subject ? `Subject: ${result.subject}\n\n${result.body}` : result?.body
    navigator.clipboard?.writeText(text || '')
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Send className="h-4 w-4 text-indigo-500" /> Signal-Driven Outreach
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><XCircle className="h-5 w-5" /></button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-white">{entity.name}</p>
            {entity.domain && <p className="text-xs text-gray-400">{entity.domain}</p>}
          </div>

          <div className="flex gap-2">
            {['email', 'sms'].map((ch) => (
              <button
                key={ch}
                onClick={() => setChannel(ch)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  channel === ch
                    ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300'
                    : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                {ch.toUpperCase()}
              </button>
            ))}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">What you offer</label>
            <input
              type="text"
              value={senderOffer}
              onChange={(e) => setSenderOffer(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
              placeholder="e.g. SEO services, POS systems, insurance..."
            />
          </div>

          <Button onClick={handleGenerate} loading={loading} className="w-full justify-center">
            <Sparkles className="h-4 w-4" /> Generate Outreach
          </Button>

          {error && <p className="text-sm text-red-500">{error}</p>}

          {result && (
            <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4 space-y-2 border border-gray-200 dark:border-gray-700">
              {result.subject && (
                <p className="text-sm"><span className="font-semibold text-gray-700 dark:text-gray-300">Subject:</span> {result.subject}</p>
              )}
              <p className="text-sm text-gray-700 dark:text-gray-200 whitespace-pre-wrap">{result.body}</p>
              <div className="flex items-center justify-between pt-2 border-t border-gray-200 dark:border-gray-700">
                <span className="text-[11px] text-gray-400">
                  {result.provider === 'claude' ? 'Generated by Claude' : 'Template'}
                  {result.basedOnSignals?.length > 0 && ` · ${result.basedOnSignals.length} signal(s)`}
                </span>
                <button onClick={copyToClipboard} className="text-xs font-medium text-indigo-600 hover:text-indigo-700">
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function EntityRow({ entity, onPromote, onScore, onFindEmails, promoting, scoring, findingEmails }) {
  const [expanded, setExpanded] = useState(false)
  const hasOutreach = entity.outreachAngles && entity.outreachAngles.length > 0
  const hasBreakdown = entity.scoreBreakdown && Object.keys(entity.scoreBreakdown).length > 0
  const isScored = entity.status === 'SCORED' || entity.gtmScore > 0

  return (
    <>
      <tr className="hover:bg-gray-50 dark:hover:bg-gray-900/30 group">
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => (hasOutreach || hasBreakdown) && setExpanded(!expanded)}
              className={`h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${
                (hasOutreach || hasBreakdown)
                  ? 'bg-gradient-to-br from-purple-100 to-indigo-100 dark:from-purple-900/40 dark:to-indigo-900/40 hover:scale-110'
                  : 'bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-900/40 dark:to-indigo-900/40'
              }`}
              title={(hasOutreach || hasBreakdown) ? 'Click to view AI insights' : entity.name}
            >
              {(hasOutreach || hasBreakdown) ? <Sparkles className="h-4 w-4 text-purple-500" /> : <Globe className="h-4 w-4 text-indigo-500" />}
            </button>
            <div className="min-w-0">
              <p className="font-medium text-gray-900 dark:text-white truncate text-sm">{entity.name}</p>
              {entity.domain && (
                <p className="text-[11px] text-gray-400 truncate">{entity.domain}</p>
              )}
            </div>
          </div>
        </td>
        <td className="px-4 py-3">
          <div className="space-y-0.5">
            {entity.email && (
              <p className="text-xs text-gray-600 dark:text-gray-300 flex items-center gap-1">
                <Mail className="h-3 w-3 text-gray-400" /> {entity.email}
              </p>
            )}
            {entity.phone && (
              <p className="text-xs text-gray-500 flex items-center gap-1">
                <Phone className="h-3 w-3 text-gray-400" /> {entity.phone}
              </p>
            )}
            {!entity.email && !entity.phone && (
              <p className="text-xs text-gray-400 italic">No contact info</p>
            )}
          </div>
        </td>
        <td className="px-4 py-3 text-center">
          <ScoreBadge score={entity.gtmScore} />
        </td>
        <td className="px-4 py-3 text-center">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{entity._count?.signals || 0}</span>
        </td>
        <td className="px-4 py-3">
          <Badge variant={STATUS_COLORS[entity.status] || 'gray'} size="sm">{entity.status}</Badge>
        </td>
        <td className="px-4 py-3 text-right">
          <div className="flex items-center gap-1 justify-end">
            {!isScored && (
              <Button
                variant="secondary"
                size="xs"
                onClick={onScore}
                loading={scoring}
                title="Run AI scoring on this entity"
              >
                <Brain className="h-3 w-3" /> Score
              </Button>
            )}
            {entity.domain && !entity.email?.includes('@') && (
              <Button
                variant="secondary"
                size="xs"
                onClick={onFindEmails}
                loading={findingEmails}
                title="Find decision-maker emails (Hunter.io)"
              >
                <AtSign className="h-3 w-3" /> Find Emails
              </Button>
            )}
            {entity.status !== 'PROMOTED' && (
              <Button
                variant="success"
                size="xs"
                onClick={onPromote}
                loading={promoting}
              >
                <ChevronUp className="h-3 w-3" /> Promote
              </Button>
            )}
            {entity.status === 'PROMOTED' && (
              <span className="text-xs text-green-600 font-medium flex items-center gap-1">
                <CheckCircle className="h-3.5 w-3.5" /> Lead
              </span>
            )}
          </div>
        </td>
      </tr>
      {expanded && (hasOutreach || hasBreakdown) && (
        <tr className="bg-purple-50/40 dark:bg-purple-900/10">
          <td colSpan={6} className="px-6 py-4">
            <div className="space-y-3 max-w-3xl">
              {hasBreakdown && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 mb-1.5">AI Score Breakdown</p>
                  <div className="grid grid-cols-3 gap-3">
                    {Object.entries(entity.scoreBreakdown).map(([k, v]) => (
                      <div key={k} className="bg-white dark:bg-gray-800 rounded-lg px-3 py-2 border border-gray-200 dark:border-gray-700">
                        <p className="text-[10px] uppercase tracking-wide text-gray-400">{k}</p>
                        <p className="text-base font-bold text-gray-900 dark:text-white">{v}<span className="text-xs text-gray-400 font-normal">/100</span></p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {hasOutreach && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 mb-1.5">Recommended Outreach Angles</p>
                  <ul className="space-y-1">
                    {entity.outreachAngles.map((angle, i) => (
                      <li key={i} className="text-sm text-gray-700 dark:text-gray-300 flex items-start gap-2 bg-white dark:bg-gray-800 rounded-lg px-3 py-2 border border-gray-200 dark:border-gray-700">
                        <Sparkles className="h-3.5 w-3.5 text-purple-500 mt-0.5 flex-shrink-0" />
                        <span>{angle}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

function ScoreBadge({ score }) {
  const color = score >= 70
    ? 'text-green-600 bg-green-50 dark:bg-green-900/30'
    : score >= 40
    ? 'text-yellow-600 bg-yellow-50 dark:bg-yellow-900/30'
    : 'text-gray-500 bg-gray-100 dark:bg-gray-700'

  return (
    <span className={`inline-block px-2 py-0.5 rounded-md text-xs font-bold ${color}`}>
      {score}
    </span>
  )
}

function StatCard({ label, value, icon: Icon, color = 'gray' }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 text-center">
      <Icon className={`h-5 w-5 mx-auto mb-1 text-${color}-500`} />
      <p className="text-xl font-bold text-gray-900 dark:text-white">{value}</p>
      <p className="text-[10px] text-gray-500 uppercase tracking-wide">{label}</p>
    </div>
  )
}

function SourcingModal({ workspaceId, onClose }) {
  const queryClient = useQueryClient()
  const [query, setQuery] = useState('')
  const [maxResults, setMaxResults] = useState(50)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!query.trim()) return

    setSubmitting(true)
    setError('')
    setResult(null)

    try {
      const res = await gtmApi.triggerSourcing(workspaceId, {
        query: query.trim(),
        maxResults,
      })
      setResult(res.data)
      queryClient.refetchQueries({ queryKey: ['gtm-runs', workspaceId] })
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to start sourcing')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md mx-4 p-6" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <Search className="h-5 w-5 text-indigo-500" />
          Run Google Maps Search
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Search Query</label>
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="e.g. dental clinics Lagos Nigeria"
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Max Results</label>
            <input
              type="number"
              value={maxResults}
              onChange={e => setMaxResults(parseInt(e.target.value, 10) || 50)}
              min={10}
              max={500}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
            <p className="text-[11px] text-gray-400 mt-1">More results = more Apify credits used</p>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          {result && (
            <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
              <p className="text-sm text-green-700 dark:text-green-300 font-medium flex items-center gap-1.5">
                <Rocket className="h-4 w-4" />
                Sourcing job queued! Check the runs table for progress.
              </p>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={onClose} type="button">Close</Button>
            <Button type="submit" loading={submitting} disabled={!!result}>
              <Search className="h-4 w-4" /> Start Search
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
