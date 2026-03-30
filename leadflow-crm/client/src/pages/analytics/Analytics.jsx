import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts'
import {
  TrendingUp, Clock, AlertTriangle, Trophy, ChevronRight,
  DollarSign, Target,
} from 'lucide-react'
import { analyticsApi } from '../../api/analytics.api'
import { useThemeStore } from '../../store/theme.store'

const STAGE_LABELS = {
  NEW: 'New',
  ENGAGED: 'Engaged',
  PROPOSAL_SENT: 'Proposal Sent',
  CLOSED_WON: 'Closed Won',
  CLOSED_LOST: 'Closed Lost',
}

const STAGE_COLORS = {
  NEW: '#6366f1',
  ENGAGED: '#8b5cf6',
  PROPOSAL_SENT: '#a78bfa',
  CLOSED_WON: '#10b981',
  CLOSED_LOST: '#f43f5e',
}

function SectionCard({ title, icon: Icon, children, className = '' }) {
  return (
    <div className={`bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-card p-5 ${className}`}>
      <div className="flex items-center gap-2 mb-4">
        <div className="h-7 w-7 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center">
          <Icon className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
        </div>
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">{title}</h3>
      </div>
      {children}
    </div>
  )
}

function MetricPill({ label, value, color = 'indigo' }) {
  const colors = {
    indigo: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300',
    green: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
    amber: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300',
    red: 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300',
  }
  return (
    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${colors[color]}`}>
      <span>{label}</span>
      <span className="font-bold">{value}</span>
    </div>
  )
}

function VelocityRow({ stage, avgDays, medianDays, sampleSize }) {
  function speedColor(days) {
    if (days === null) return 'text-gray-400'
    if (days <= 7) return 'text-emerald-600 dark:text-emerald-400'
    if (days <= 14) return 'text-amber-600 dark:text-amber-400'
    return 'text-red-600 dark:text-red-400'
  }
  function speedBg(days) {
    if (days === null) return 'bg-gray-100 dark:bg-gray-800'
    if (days <= 7) return 'bg-emerald-500'
    if (days <= 14) return 'bg-amber-400'
    return 'bg-red-500'
  }
  const pct = avgDays ? Math.min(100, (avgDays / 30) * 100) : 0

  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-gray-100 dark:border-gray-800 last:border-0">
      <div className="w-28 text-xs font-medium text-gray-600 dark:text-gray-400 shrink-0">
        {STAGE_LABELS[stage] || stage}
      </div>
      <div className="flex-1 h-2 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
        <div className={`h-full rounded-full transition-all ${speedBg(avgDays)}`} style={{ width: `${pct}%` }} />
      </div>
      <div className={`w-16 text-right text-sm font-semibold tabular-nums ${speedColor(avgDays)}`}>
        {avgDays !== null ? `${avgDays}d avg` : '—'}
      </div>
      <div className="w-10 text-right text-xs text-gray-400">
        {sampleSize > 0 ? `n=${sampleSize}` : ''}
      </div>
    </div>
  )
}

function AgingDealCard({ deal }) {
  const urgency = deal.daysStale >= 30 ? 'red' : deal.daysStale >= 14 ? 'amber' : 'gray'
  const urgencyClasses = {
    red: 'border-l-red-500 bg-red-50 dark:bg-red-500/5',
    amber: 'border-l-amber-400 bg-amber-50 dark:bg-amber-500/5',
    gray: 'border-l-gray-300 dark:border-l-gray-600',
  }
  return (
    <div className={`flex items-center justify-between px-3 py-2.5 rounded-lg border-l-2 ${urgencyClasses[urgency]}`}>
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
          {deal.lead.firstName} {deal.lead.lastName}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {deal.lead.company || 'No company'} · {STAGE_LABELS[deal.stage] || deal.stage}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className={`text-xs font-bold tabular-nums ${urgency === 'red' ? 'text-red-600 dark:text-red-400' : urgency === 'amber' ? 'text-amber-600 dark:text-amber-400' : 'text-gray-500'}`}>
          {deal.daysStale}d
        </span>
        <Link
          to={`/leads/${deal.lead.id}`}
          className="p-1 rounded text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  )
}

const DAY_OPTIONS = [
  { label: '7d', value: 7 },
  { label: '30d', value: 30 },
  { label: '90d', value: 90 },
]

export default function Analytics() {
  const { isDark } = useThemeStore()
  const [days, setDays] = useState(30)

  const tooltipStyle = {
    backgroundColor: isDark ? '#1f2937' : '#fff',
    border: `1px solid ${isDark ? '#374151' : '#e5e7eb'}`,
    borderRadius: '8px',
    color: isDark ? '#f9fafb' : '#111827',
    fontSize: '12px',
  }

  const { data: funnelData, isLoading: funnelLoading } = useQuery({
    queryKey: ['analytics-funnel', days],
    queryFn: () => analyticsApi.getFunnel({ days }).then(r => r.data.data),
  })

  const { data: velocityData, isLoading: velocityLoading } = useQuery({
    queryKey: ['analytics-velocity', days],
    queryFn: () => analyticsApi.getVelocity({ days }).then(r => r.data.data),
  })

  const { data: agingData, isLoading: agingLoading } = useQuery({
    queryKey: ['analytics-aging'],
    queryFn: () => analyticsApi.getAging({ threshold: 14, limit: 15 }).then(r => r.data.data),
  })

  const { data: overviewData } = useQuery({
    queryKey: ['analytics-overview', days],
    queryFn: () => analyticsApi.getOverview({ days }).then(r => r.data.data),
  })

  const funnel = funnelData?.funnel || []
  const velocity = velocityData?.velocity || []
  const staleDeals = agingData?.staleDeals || []
  const overview = overviewData || {}

  // Chart data: label + value for the funnel bar chart
  const chartData = funnel.map(f => ({
    stage: STAGE_LABELS[f.stage] || f.stage,
    deals: f.count,
    fill: STAGE_COLORS[f.stage] || '#6366f1',
    conversionRate: f.conversionRate,
  }))

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Analytics</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Funnel performance, deal velocity, and aging alerts
          </p>
        </div>

        {/* Day range toggle */}
        <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
          {DAY_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setDays(opt.value)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                days === opt.value
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Overview stat row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Win Rate', value: overview.winRate != null ? `${overview.winRate}%` : '—', icon: Trophy, color: 'emerald' },
          { label: 'New Leads', value: overview.newLeads ?? '—', icon: Target, color: 'indigo' },
          { label: 'Avg Deal Size', value: overview.avgDealSize != null ? `$${overview.avgDealSize.toLocaleString()}` : '—', icon: DollarSign, color: 'violet' },
          { label: 'Active Sequences', value: overview.activeSequences ?? '—', icon: TrendingUp, color: 'blue' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-card p-4">
            <div className={`h-8 w-8 rounded-lg mb-3 flex items-center justify-center ${
              color === 'emerald' ? 'bg-emerald-50 dark:bg-emerald-500/10' :
              color === 'violet' ? 'bg-violet-50 dark:bg-violet-500/10' :
              color === 'blue' ? 'bg-blue-50 dark:bg-blue-500/10' :
              'bg-indigo-50 dark:bg-indigo-500/10'
            }`}>
              <Icon className={`h-4 w-4 ${
                color === 'emerald' ? 'text-emerald-600 dark:text-emerald-400' :
                color === 'violet' ? 'text-violet-600 dark:text-violet-400' :
                color === 'blue' ? 'text-blue-600 dark:text-blue-400' :
                'text-indigo-600 dark:text-indigo-400'
              }`} />
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white tabular-nums">{value}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{label} · last {days}d</p>
          </div>
        ))}
      </div>

      {/* Funnel + Velocity row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pipeline Funnel */}
        <SectionCard title="Pipeline Funnel" icon={TrendingUp}>
          {funnelLoading ? (
            <div className="h-48 flex items-center justify-center text-sm text-gray-400">Loading…</div>
          ) : chartData.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-sm text-gray-400">No deals yet</div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData} layout="vertical" margin={{ left: 80, right: 16, top: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#374151' : '#f3f4f6'} horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: isDark ? '#9ca3af' : '#6b7280' }} />
                  <YAxis
                    type="category"
                    dataKey="stage"
                    tick={{ fontSize: 11, fill: isDark ? '#9ca3af' : '#6b7280' }}
                    width={76}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(val, name, props) => {
                      const cr = props.payload?.conversionRate
                      return [
                        <span key="v">
                          {val} deals{cr != null ? ` · ${cr}% from prev` : ''}
                        </span>,
                        'Stage',
                      ]
                    }}
                  />
                  <Bar dataKey="deals" radius={[0, 4, 4, 0]} maxBarSize={24}>
                    {chartData.map((entry, idx) => (
                      <Cell key={idx} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>

              {/* Conversion rate badges */}
              <div className="flex flex-wrap gap-1.5 mt-2">
                {funnel.map((f, idx) => idx > 0 && f.conversionRate != null && (
                  <MetricPill
                    key={f.stage}
                    label={`${STAGE_LABELS[funnel[idx - 1]?.stage]}→${STAGE_LABELS[f.stage]}`}
                    value={`${f.conversionRate}%`}
                    color={f.conversionRate >= 50 ? 'green' : f.conversionRate >= 25 ? 'amber' : 'red'}
                  />
                ))}
              </div>
            </>
          )}
        </SectionCard>

        {/* Deal Velocity */}
        <SectionCard title="Deal Velocity" icon={Clock}>
          <p className="text-xs text-gray-400 dark:text-gray-500 -mt-2 mb-3">
            Average days a deal spends in each stage before advancing
          </p>
          {velocityLoading ? (
            <div className="h-48 flex items-center justify-center text-sm text-gray-400">Loading…</div>
          ) : velocity.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-sm text-gray-400">
              Move deals between stages to see velocity
            </div>
          ) : (
            <div>
              {velocity.map(v => (
                <VelocityRow key={v.stage} {...v} />
              ))}
              <div className="flex items-center gap-4 mt-3 text-[10px] text-gray-400 dark:text-gray-500">
                <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />≤7d healthy</span>
                <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-amber-400" />7–14d watch</span>
                <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-red-500" />&gt;14d stale</span>
              </div>
            </div>
          )}
        </SectionCard>
      </div>

      {/* Aging Alerts */}
      <SectionCard title={`Stale Deals (>14 days in stage)`} icon={AlertTriangle}>
        {agingLoading ? (
          <div className="py-8 flex items-center justify-center text-sm text-gray-400">Loading…</div>
        ) : staleDeals.length === 0 ? (
          <div className="py-8 flex flex-col items-center justify-center gap-2">
            <div className="h-10 w-10 rounded-full bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center">
              <Trophy className="h-5 w-5 text-emerald-500" />
            </div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">All deals are moving!</p>
            <p className="text-xs text-gray-400">No deals have been stuck for more than 14 days.</p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 mb-3">
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {agingData?.total} stale deal{agingData?.total !== 1 ? 's' : ''} found
              </span>
              {Object.entries(agingData?.stageSummary || {}).map(([stage, s]) => (
                <MetricPill
                  key={stage}
                  label={STAGE_LABELS[stage] || stage}
                  value={`${s.count} · avg ${s.avgDaysStale}d`}
                  color={s.avgDaysStale >= 30 ? 'red' : 'amber'}
                />
              ))}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {staleDeals.map(deal => (
                <AgingDealCard key={deal.dealId} deal={deal} />
              ))}
            </div>
          </>
        )}
      </SectionCard>
    </div>
  )
}
