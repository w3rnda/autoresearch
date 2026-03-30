import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Mail, MousePointer, Send, Calendar, Zap, ZapOff, DollarSign, FileText, User, Briefcase } from 'lucide-react'
import toast from 'react-hot-toast'
import { leadsApi } from '../../api/leads.api'
import { formatCurrency, formatDateTime, formatDate, getInitials } from '../../utils/format'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Badge from '../../components/ui/Badge'
import Select from '../../components/ui/Select'
import Spinner from '../../components/ui/Spinner'
import ScoreBreakdown from '../../components/leads/ScoreBreakdown'
import DealWorkspace from '../../components/workspace/DealWorkspace'

const STATUS_OPTIONS = [
  { value: 'COLD', label: 'Cold' },
  { value: 'WARM', label: 'Warm' },
  { value: 'HOT', label: 'Hot' },
  { value: 'CUSTOMER', label: 'Customer' },
]

const SOURCE_OPTIONS = [
  { value: 'WEBSITE', label: 'Website' },
  { value: 'REFERRAL', label: 'Referral' },
  { value: 'COLD_OUTREACH', label: 'Cold Outreach' },
  { value: 'SOCIAL_MEDIA', label: 'Social Media' },
  { value: 'EVENT', label: 'Event' },
  { value: 'OTHER', label: 'Other' },
]

const STATUS_BADGE_MAP = {
  COLD: 'cold', WARM: 'warm', HOT: 'hot', CUSTOMER: 'customer',
}

const EMAIL_EVENT_ICONS = {
  OPEN: <Mail className="h-4 w-4 text-blue-500" />,
  CLICK: <MousePointer className="h-4 w-4 text-green-500" />,
  SENT: <Send className="h-4 w-4 text-gray-400" />,
}

const STAGE_BADGE_MAP = {
  New: 'info',
  Engaged: 'warning',
  'Proposal Sent': 'warning',
  'Closed Won': 'success',
  'Closed Lost': 'error',
}

function ScoreGauge({ score }) {
  const pct = Math.min(Math.max(score ?? 0, 0), 100)
  const color = pct >= 60 ? 'text-red-600' : pct >= 30 ? 'text-amber-500' : 'text-blue-500'
  const barColor = pct >= 60 ? 'bg-red-500' : pct >= 30 ? 'bg-amber-400' : 'bg-blue-400'
  const label = pct >= 60 ? 'Hot' : pct >= 30 ? 'Warm' : 'Cold'

  return (
    <div className="flex items-center gap-3 mt-2">
      <div className="flex flex-col items-start gap-1 min-w-[140px]">
        <div className="flex items-center justify-between w-full">
          <span className="text-xs text-gray-400 font-medium">Lead Score</span>
          <span className={`text-sm font-bold ${color}`}>{pct} / 100</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
          <div
            className={`h-2 rounded-full transition-all duration-700 ${barColor}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className={`text-xs font-semibold ${color}`}>{label}</span>
      </div>
    </div>
  )
}

export default function LeadDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState('activity')
  const [form, setForm] = useState(null)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['lead', id],
    queryFn: () => leadsApi.getLeadById(id).then((r) => r.data.data),
    onSuccess: (lead) => {
      if (!form) {
        setForm({
          firstName: lead.firstName || '',
          lastName: lead.lastName || '',
          email: lead.email || '',
          phone: lead.phone || '',
          company: lead.company || '',
          source: lead.source || '',
          status: lead.status || 'COLD',
          tags: (lead.tags || []).join(', '),
        })
      }
    },
  })

  const lead = data

  const updateMutation = useMutation({
    mutationFn: (payload) => leadsApi.updateLead(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead', id] })
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      toast.success('Lead updated!')
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Update failed'),
  })

  const enrichMutation = useMutation({
    mutationFn: () => leadsApi.enrichLead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead', id] })
      toast.success('Lead enriched!')
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Enrichment failed'),
  })

  const deenrichMutation = useMutation({
    mutationFn: () => leadsApi.deenrichLead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead', id] })
      toast.success('Enrichment reversed')
    },
    onError: (err) => toast.error(err.response?.data?.error || 'De-enrichment failed'),
  })

  const handleSave = (e) => {
    e.preventDefault()
    const payload = {
      ...form,
      tags: form.tags ? form.tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
    }
    updateMutation.mutate(payload)
  }

  const setField = (field) => (e) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }))

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Spinner size="lg" />
      </div>
    )
  }

  if (isError || !lead) {
    return (
      <div className="p-6 text-center">
        <p className="text-gray-500">Lead not found.</p>
        <Button variant="secondary" size="sm" className="mt-4" onClick={() => navigate('/leads')}>
          Back to Leads
        </Button>
      </div>
    )
  }

  const emailEvents = lead.emailEvents || []
  const deals = lead.deals || []
  const meetings = lead.meetings || []
  const quotes = lead.quotes || []

  const currentForm = form || {
    firstName: lead.firstName || '',
    lastName: lead.lastName || '',
    email: lead.email || '',
    phone: lead.phone || '',
    company: lead.company || '',
    source: lead.source || '',
    status: lead.status || 'COLD',
    tags: (lead.tags || []).join(', '),
  }

  // Build unified activity count for the tab label
  const totalActivityCount = emailEvents.length + meetings.length + deals.length + quotes.length

  const TABS = [
    { key: 'activity',  label: 'Activity',  count: totalActivityCount },
    { key: 'workspace', label: 'Workspace',  count: 0 },
    { key: 'deals',     label: 'Deals',     count: deals.length },
    { key: 'meetings',  label: 'Meetings',  count: meetings.length },
    { key: 'quotes',    label: 'Quotes',    count: quotes.length },
  ]

  // Last 3 email events that contributed to score (OPEN or CLICK)
  const scoringEvents = emailEvents
    .filter((ev) => ev.type === 'OPEN' || ev.type === 'CLICK')
    .slice(0, 3)

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Back button */}
      <button
        onClick={() => navigate('/leads')}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Leads
      </button>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-indigo-100 flex items-center justify-center text-xl font-bold text-indigo-700">
            {getInitials(lead.firstName, lead.lastName)}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {lead.firstName} {lead.lastName}
            </h1>
            <p className="text-gray-500 text-sm mt-0.5">{lead.company || lead.email}</p>
            <div className="flex items-center gap-3 mt-1">
              <Badge variant={STATUS_BADGE_MAP[lead.status] || 'gray'}>{lead.status}</Badge>
              <ScoreGauge score={lead.score ?? 0} />
            </div>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="secondary"
            size="sm"
            loading={enrichMutation.isPending}
            onClick={() => enrichMutation.mutate()}
          >
            <Zap className="h-4 w-4" /> Enrich Lead
          </Button>
          <Button
            variant="ghost"
            size="sm"
            loading={deenrichMutation.isPending}
            onClick={() => deenrichMutation.mutate()}
            title="Remove enrichment: reverts score boost and strips auto-added industry tags"
          >
            <ZapOff className="h-4 w-4" /> De-enrich
          </Button>
          <Button variant="secondary" size="sm" onClick={() => navigate('/meetings')}>
            <Calendar className="h-4 w-4" /> Book Meeting
          </Button>
        </div>
      </div>

      {/* Primary tab bar — always visible */}
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
        <nav className="flex border-b border-gray-100 dark:border-gray-800">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-4 py-3 text-xs font-medium transition-colors ${
                activeTab === tab.key
                  ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50 dark:bg-indigo-900/20'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
            >
              {tab.key === 'workspace' && <Briefcase className="h-3.5 w-3.5" />}
              {tab.label}
              {tab.count > 0 && (
                <span className="bg-gray-100 text-gray-600 text-xs rounded-full px-1.5 py-0.5">
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Full-width Deal Workspace section */}
      {activeTab === 'workspace' && (
        <DealWorkspace leadId={id} />
      )}

      {/* Two-column layout (hidden when workspace tab is active) */}
      <div className={`grid grid-cols-1 xl:grid-cols-5 gap-6 ${activeTab === 'workspace' ? 'hidden' : ''}`}>
        {/* Left: Edit form (60%) */}
        <div className="xl:col-span-3">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-base font-semibold text-gray-800 mb-4">Lead Details</h2>
            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="First Name"
                  value={currentForm.firstName}
                  onChange={setField('firstName')}
                  placeholder="Jane"
                />
                <Input
                  label="Last Name"
                  value={currentForm.lastName}
                  onChange={setField('lastName')}
                  placeholder="Doe"
                />
              </div>
              <Input
                label="Email"
                type="email"
                value={currentForm.email}
                onChange={setField('email')}
                placeholder="jane@example.com"
              />
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Phone"
                  type="tel"
                  value={currentForm.phone}
                  onChange={setField('phone')}
                  placeholder="+1 555 000 0000"
                />
                <Input
                  label="Company"
                  value={currentForm.company}
                  onChange={setField('company')}
                  placeholder="Acme Corp"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Select
                  label="Source"
                  options={SOURCE_OPTIONS}
                  value={currentForm.source}
                  onChange={setField('source')}
                  placeholder="Select source"
                />
                <Select
                  label="Status"
                  options={STATUS_OPTIONS}
                  value={currentForm.status}
                  onChange={setField('status')}
                />
              </div>
              <Input
                label="Tags (comma-separated)"
                value={currentForm.tags}
                onChange={setField('tags')}
                placeholder="vip, follow-up"
              />
              <div className="flex justify-end pt-2">
                <Button type="submit" loading={updateMutation.isPending}>Save Changes</Button>
              </div>
            </form>
          </div>
        </div>

        {/* Right: Score breakdown + assigned + Activity tabs (40%) */}
        <div className="xl:col-span-2 space-y-4">
          {/* Score breakdown */}
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 p-4">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Score Breakdown</h3>
            <ScoreBreakdown
              engagementScore={lead.engagementScore ?? 0}
              fitScore={lead.fitScore ?? 0}
              score={lead.score ?? 0}
            />
            {scoringEvents.length > 0 && (
              <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-800">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">
                  Recent score events
                </p>
                <div className="space-y-1.5">
                  {scoringEvents.map((ev, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                      <span className="flex-shrink-0">
                        {EMAIL_EVENT_ICONS[ev.type] || <Mail className="h-3 w-3 text-gray-400" />}
                      </span>
                      <span className="flex-1 min-w-0 truncate">
                        Email {ev.type?.toLowerCase()}
                      </span>
                      <span className="text-gray-400 flex-shrink-0">
                        {ev.type === 'CLICK' ? '+20' : '+10'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Assigned to */}
          {lead.assignedTo && (
            <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 p-4">
              <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2">Assigned To</h3>
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center">
                  <User className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                </div>
                <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{lead.assignedTo.name}</span>
              </div>
            </div>
          )}

          {/* Activity content panel */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-4 max-h-96 overflow-y-auto">
              {/* Unified Activity Tab */}
              {activeTab === 'activity' && (
                <div className="space-y-1">
                  {(() => {
                    const items = [
                      ...emailEvents.map((ev) => ({
                        id: ev.id || Math.random(),
                        type: 'email',
                        label: `Email ${ev.type?.toLowerCase()}${ev.metadata?.subject ? ` — "${ev.metadata.subject}"` : ''}`,
                        at: ev.createdAt,
                        icon: EMAIL_EVENT_ICONS[ev.type] || <Mail className="h-4 w-4 text-gray-400" />,
                      })),
                      ...meetings.map((m) => ({
                        id: m.id,
                        type: 'meeting',
                        label: `Meeting scheduled for ${formatDate(m.scheduledAt)}`,
                        at: m.createdAt,
                        icon: <Calendar className="h-4 w-4 text-indigo-400" />,
                      })),
                      ...deals.map((d) => ({
                        id: d.id,
                        type: 'deal',
                        label: `Deal moved to ${d.stage.replace(/_/g, ' ')} — ${formatCurrency(d.value)}`,
                        at: d.createdAt,
                        icon: <DollarSign className="h-4 w-4 text-green-500" />,
                      })),
                      ...quotes.map((q) => ({
                        id: q.id,
                        type: 'quote',
                        label: `Quote ${q.status?.toLowerCase()} — ${formatCurrency(q.totalAmount)}`,
                        at: q.createdAt,
                        icon: <FileText className="h-4 w-4 text-purple-400" />,
                      })),
                    ].sort((a, b) => new Date(b.at) - new Date(a.at))

                    if (items.length === 0) {
                      return <p className="text-center text-gray-400 text-sm py-8">No activity yet</p>
                    }

                    return items.map((item) => (
                      <div
                        key={item.id + item.type}
                        className="flex items-start gap-3 py-2.5 border-b border-gray-50 last:border-0"
                      >
                        <div className="mt-0.5 flex-shrink-0">{item.icon}</div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-700 leading-snug">{item.label}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{formatDateTime(item.at)}</p>
                        </div>
                      </div>
                    ))
                  })()}
                </div>
              )}

              {/* Deals Tab */}
              {activeTab === 'deals' && (
                <div className="space-y-3">
                  {deals.length === 0 ? (
                    <p className="text-center text-gray-400 text-sm py-8">No deals yet</p>
                  ) : (
                    deals.map((deal) => (
                      <div key={deal.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                        <div>
                          <p className="text-sm font-medium text-gray-800">{deal.stage}</p>
                          <p className="text-xs text-gray-400">{deal.probability}% probability</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-gray-900">{formatCurrency(deal.value)}</p>
                          <Badge variant={STAGE_BADGE_MAP[deal.stage] || 'gray'} className="mt-1">
                            {deal.stage}
                          </Badge>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Meetings Tab */}
              {activeTab === 'meetings' && (
                <div className="space-y-3">
                  {meetings.length === 0 ? (
                    <p className="text-center text-gray-400 text-sm py-8">No meetings scheduled</p>
                  ) : (
                    meetings.map((meeting) => (
                      <div key={meeting.id} className="flex items-start gap-3 py-2 border-b border-gray-50 last:border-0">
                        <Calendar className="h-4 w-4 text-indigo-400 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-sm font-medium text-gray-800">{formatDateTime(meeting.scheduledAt)}</p>
                          {meeting.notes && (
                            <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{meeting.notes}</p>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Quotes Tab */}
              {activeTab === 'quotes' && (
                <div className="space-y-3">
                  {quotes.length === 0 ? (
                    <p className="text-center text-gray-400 text-sm py-8">No quotes yet</p>
                  ) : (
                    quotes.map((quote) => (
                      <div key={quote.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                        <div>
                          <p className="text-sm font-medium text-gray-800">Quote #{quote.id?.slice(-6)}</p>
                          <p className="text-xs text-gray-400">{formatDate(quote.createdAt)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-gray-900">{formatCurrency(quote.totalAmount)}</p>
                          <Badge variant={quote.status?.toLowerCase() || 'draft'} className="mt-1">
                            {quote.status}
                          </Badge>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
