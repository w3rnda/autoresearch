import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { gtmApi } from '../../api/gtm.api'
import Button from '../../components/ui/Button'
import Badge from '../../components/ui/Badge'
import Spinner from '../../components/ui/Spinner'
import {
  ArrowLeft, Play, Search, Globe, Users, TrendingUp, Zap,
  CheckCircle, XCircle, Clock, Rocket, ExternalLink, Mail,
  Phone, MapPin, Star, ChevronUp,
} from 'lucide-react'

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
    refetchInterval: 10000,
  })

  const activateMutation = useMutation({
    mutationFn: () => gtmApi.activateWorkspace(workspaceId),
    onSuccess: () => {
      queryClient.refetchQueries({ queryKey: ['gtm-workspace', workspaceId] })
      queryClient.refetchQueries({ queryKey: ['gtm-runs', workspaceId] })
    },
  })

  const promoteMutation = useMutation({
    mutationFn: (entityId) => gtmApi.promoteEntity(workspaceId, entityId),
    onSuccess: () => {
      queryClient.refetchQueries({ queryKey: ['gtm-entities', workspaceId] })
    },
  })

  if (wsLoading) {
    return <div className="flex items-center justify-center h-64"><Spinner size="lg" /></div>
  }

  if (!wsData) {
    return <div className="p-6 text-center text-gray-500">Workspace not found</div>
  }

  const entities = entitiesData?.data || []
  const runs = runsData?.data || []
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
        <div className="flex gap-2">
          {wsData.status === 'DRAFT' && (
            <Button
              onClick={() => activateMutation.mutate()}
              loading={activateMutation.isPending}
            >
              <Play className="h-4 w-4" /> Activate
            </Button>
          )}
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
                    promoting={promoteMutation.isPending}
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
    </div>
  )
}

function EntityRow({ entity, onPromote, promoting }) {
  return (
    <tr className="hover:bg-gray-50 dark:hover:bg-gray-900/30 group">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-900/40 dark:to-indigo-900/40 flex items-center justify-center flex-shrink-0">
            <Globe className="h-4 w-4 text-indigo-500" />
          </div>
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
          <span className="text-xs text-green-600 font-medium flex items-center gap-1 justify-end">
            <CheckCircle className="h-3.5 w-3.5" /> Lead
          </span>
        )}
      </td>
    </tr>
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
