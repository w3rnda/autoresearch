import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line, CartesianGrid, XAxis, YAxis,
  BarChart, Bar,
} from 'recharts'
import { dashboardApi } from '../api/dashboard.api'
import { useAuthStore } from '../store/auth.store'
import { useThemeStore } from '../store/theme.store'
import { formatCurrency, formatDate } from '../utils/format'
import Badge from '../components/ui/Badge'
import Spinner from '../components/ui/Spinner'
import Button from '../components/ui/Button'
import { Users, Flame, DollarSign, Mail, Calendar, Plus, Kanban, FileText, Trophy, TrendingUp } from 'lucide-react'

const STATUS_PIE_COLORS = {
  cold: '#3b82f6',
  warm: '#f59e0b',
  hot: '#ef4444',
  customer: '#22c55e',
}


const QUICK_ACTIONS = [
  { label: 'Add new lead', path: '/leads', icon: Plus },
  { label: 'View pipeline', path: '/pipeline', icon: Kanban },
  { label: 'Schedule meeting', path: '/meetings', icon: Calendar },
  { label: 'Create quote', path: '/quotes', icon: FileText },
]

function StatCard({ label, value, icon: Icon, iconBg, iconColor, sub, trend }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-5 flex items-start gap-4">
      <div className={`flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center ${iconBg}`}>
        <Icon className={`h-5 w-5 ${iconColor}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">{label}</p>
        <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-0.5 leading-tight">{value}</p>
        {sub && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{sub}</p>}
      </div>
      {trend !== undefined && (
        <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-md flex-shrink-0 mt-0.5 ${
          trend >= 0 ? 'text-green-700 bg-green-50 dark:text-green-400 dark:bg-green-900/30' : 'text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-900/30'
        }`}>
          {trend >= 0 ? '+' : ''}{trend}%
        </span>
      )}
    </div>
  )
}

function SkeletonCard() {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-5 animate-pulse">
      <div className="flex items-start gap-4">
        <div className="w-11 h-11 rounded-xl bg-gray-200 dark:bg-gray-700" />
        <div className="flex-1 space-y-2 pt-0.5">
          <div className="h-2.5 bg-gray-200 dark:bg-gray-700 rounded w-2/5" />
          <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-3/5" />
        </div>
      </div>
    </div>
  )
}

function SectionCard({ title, children, action }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
      {(title || action) && (
        <div className="flex items-center justify-between mb-4">
          {title && <h3 className="font-semibold text-gray-800 dark:text-gray-100 text-sm">{title}</h3>}
          {action}
        </div>
      )}
      {children}
    </div>
  )
}

export default function Dashboard() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { isDark } = useThemeStore()

  const { data: stats, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => dashboardApi.getStats().then((r) => r.data.data),
    staleTime: 60_000,
  })

  const totalLeads = stats?.totalLeads ?? 0
  const hotLeads = stats?.hotLeads ?? 0
  const pipelineValue = stats?.pipelineValue ?? 0
  const emailOpenRate = stats?.emailOpenRate ?? 0
  const recentLeads = stats?.recentLeads ?? []
  const topLeads = stats?.topLeads ?? []
  const statusBreakdown = stats?.statusBreakdown ?? {}
  const upcomingMeetings = stats?.upcomingMeetings ?? 0
  const leadsOverTime = stats?.leadsOverTime ?? []
  const funnelData = stats?.funnelData ?? []
  const activeSequences = stats?.activeSequences ?? 0
  const emailsSent7d = stats?.emailsSent7d ?? 0
  const activeDeals = stats?.activeDeals ?? 0

  const statusEntries = [
    { key: 'cold', label: 'Cold', count: statusBreakdown.cold ?? 0 },
    { key: 'warm', label: 'Warm', count: statusBreakdown.warm ?? 0 },
    { key: 'hot', label: 'Hot', count: statusBreakdown.hot ?? 0 },
    { key: 'customer', label: 'Customer', count: statusBreakdown.customer ?? 0 },
  ]

  const pieData = statusEntries.filter((s) => s.count > 0).map((s) => ({ name: s.label, value: s.count, key: s.key }))
  const pieDataFinal = pieData.length > 0 ? pieData : statusEntries.map((s) => ({ name: s.label, value: 1, key: s.key }))

  // Dark-mode aware chart styles
  const chartGridColor = isDark ? '#374151' : '#f3f4f6'
  const chartAxisColor = isDark ? '#6b7280' : '#9ca3af'
  const tooltipStyle = {
    borderRadius: '10px',
    border: `1px solid ${isDark ? '#374151' : '#e5e7eb'}`,
    backgroundColor: isDark ? '#1f2937' : '#ffffff',
    color: isDark ? '#f9fafb' : '#111827',
    fontSize: '12px',
    boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
  }

  // Sample win rate from customers vs total
  const winRate = totalLeads > 0 ? Math.round(((statusBreakdown.customer ?? 0) / totalLeads) * 100) : 0

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
            Good morning, {user?.name?.split(' ')[0] ?? 'there'} 👋
          </h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">Here's what's happening with your pipeline today.</p>
        </div>
        <Button variant="secondary" size="sm" loading={isFetching} onClick={() => refetch()}>
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </Button>
      </div>

      {/* Stats Grid — 5 cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <StatCard label="Total Leads" value={totalLeads.toLocaleString()} iconBg="bg-blue-50 dark:bg-blue-900/30" iconColor="text-blue-600 dark:text-blue-400" icon={Users} trend={12} />
            <StatCard label="Hot Leads" value={hotLeads.toLocaleString()} iconBg="bg-red-50 dark:bg-red-900/30" iconColor="text-red-500 dark:text-red-400" icon={Flame} sub="Ready for outreach" />
            <StatCard label="Pipeline Value" value={formatCurrency(pipelineValue)} iconBg="bg-green-50 dark:bg-green-900/30" iconColor="text-green-600 dark:text-green-400" icon={DollarSign} sub="Active deals" trend={8} />
            <StatCard label="Email Open Rate" value={`${emailOpenRate}%`} iconBg="bg-purple-50 dark:bg-purple-900/30" iconColor="text-purple-600 dark:text-purple-400" icon={Mail} sub="Last 30 days" />
            <StatCard label="Win Rate" value={`${winRate}%`} iconBg="bg-amber-50 dark:bg-amber-900/30" iconColor="text-amber-600 dark:text-amber-400" icon={Trophy} sub="Leads → customers" />
          </>
        )}
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left column */}
        <div className="xl:col-span-2 space-y-6">

          {/* Lead Status Pie Chart */}
          <SectionCard title="Lead Status Breakdown">
            {isLoading ? (
              <div className="flex items-center justify-center h-[220px] animate-pulse">
                <div className="w-40 h-40 rounded-full bg-gray-200 dark:bg-gray-700" />
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={pieDataFinal} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value">
                    {pieDataFinal.map((entry) => (
                      <Cell key={entry.key} fill={STATUS_PIE_COLORS[entry.key]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} formatter={(value, name) => [value, name]} />
                  <Legend
                    iconType="circle"
                    iconSize={8}
                    formatter={(value) => (
                      <span style={{ fontSize: '12px', color: isDark ? '#9ca3af' : '#6b7280' }}>{value}</span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </SectionCard>

          {/* Pipeline Conversion Funnel — real data */}
          <SectionCard title="Pipeline Conversion Funnel" action={
            <button onClick={() => navigate('/analytics')} className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-medium flex items-center gap-1">
              <TrendingUp className="h-3.5 w-3.5" />Full analytics
            </button>
          }>
            {funnelData.length === 0 ? (
              <div className="h-[200px] flex items-center justify-center text-sm text-gray-400">
                Move deals through the pipeline to see the funnel
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={funnelData} layout="vertical" margin={{ top: 0, right: 16, left: 80, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: chartAxisColor }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="stage" tick={{ fontSize: 11, fill: chartAxisColor }} axisLine={false} tickLine={false} width={76} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(value) => [value, 'Deals']} />
                  <Bar dataKey="value" radius={[0, 6, 6, 0]} maxBarSize={28}>
                    {funnelData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </SectionCard>

          {/* Recent Leads */}
          <SectionCard title="Recent Leads" action={
            <button onClick={() => navigate('/leads')} className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-medium">
              View all
            </button>
          }>
            {isLoading ? (
              <div className="animate-pulse space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 py-2">
                    <div className="w-8 h-8 bg-gray-200 dark:bg-gray-700 rounded-full" />
                    <div className="flex-1 space-y-1">
                      <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
                      <div className="h-2.5 bg-gray-100 dark:bg-gray-600 rounded w-1/4" />
                    </div>
                    <div className="w-14 h-5 bg-gray-200 dark:bg-gray-700 rounded-full" />
                  </div>
                ))}
              </div>
            ) : recentLeads.length === 0 ? (
              <p className="text-gray-400 dark:text-gray-500 text-sm py-4 text-center">No leads yet. Add your first lead!</p>
            ) : (
              <div className="divide-y divide-gray-50 dark:divide-gray-700/50">
                {recentLeads.map((lead) => (
                  <div
                    key={lead.id}
                    onClick={() => navigate(`/leads/${lead.id}`)}
                    className="flex items-center gap-3 py-2.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/40 rounded-lg px-2 -mx-2 transition-colors"
                  >
                    <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-xs font-bold text-indigo-700 dark:text-indigo-300 flex-shrink-0">
                      {(lead.firstName || lead.name || '?').charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">
                        {lead.firstName ? `${lead.firstName} ${lead.lastName}` : lead.name}
                      </p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{lead.company || lead.email}</p>
                    </div>
                    <Badge variant={lead.status}>{lead.status}</Badge>
                    <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">{formatDate(lead.createdAt)}</span>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          {/* Leads Over Time — real weekly data */}
          <SectionCard title="Leads Added Over Time" action={
            <span className="text-xs text-gray-400 dark:text-gray-500">Last 8 weeks</span>
          }>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={leadsOverTime} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} />
                <XAxis dataKey="week" tick={{ fontSize: 10, fill: chartAxisColor }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11, fill: chartAxisColor }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} formatter={(value) => [value, 'Leads']} />
                <Line type="monotone" dataKey="leads" stroke="#6366f1" strokeWidth={2.5} dot={{ fill: '#6366f1', r: 4 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </SectionCard>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          {/* Top Leads by Score */}
          <SectionCard title="Top Leads by Score">
            {isLoading ? (
              <div className="animate-pulse space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="flex-1 h-3 bg-gray-200 dark:bg-gray-700 rounded" />
                    <div className="w-10 h-5 bg-gray-200 dark:bg-gray-700 rounded-full" />
                  </div>
                ))}
              </div>
            ) : topLeads.length === 0 ? (
              <p className="text-gray-400 dark:text-gray-500 text-sm text-center py-4">No scored leads yet.</p>
            ) : (
              <div className="space-y-1">
                {topLeads.map((lead, idx) => (
                  <div
                    key={lead.id}
                    onClick={() => navigate(`/leads/${lead.id}`)}
                    className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/40 rounded-lg px-2 py-1.5 -mx-2 transition-colors"
                  >
                    <span className="w-5 text-xs text-gray-400 font-bold text-center flex-shrink-0">{idx + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">
                        {lead.firstName ? `${lead.firstName} ${lead.lastName}` : lead.name}
                      </p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{lead.company || '—'}</p>
                    </div>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${
                      lead.score >= 80 ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                      lead.score >= 50 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                      'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                    }`}>
                      {lead.score}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          {/* Upcoming Meetings */}
          <SectionCard title="Upcoming Meetings">
            {isLoading ? (
              <div className="animate-pulse h-16 bg-gray-100 dark:bg-gray-700 rounded-lg" />
            ) : (
              <div className="text-center py-3">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-indigo-900/30 mb-3">
                  <Calendar className="h-7 w-7 text-indigo-600 dark:text-indigo-400" />
                </div>
                <p className="text-3xl font-extrabold text-gray-900 dark:text-gray-100">{upcomingMeetings}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">scheduled this week</p>
                <button
                  onClick={() => navigate('/meetings')}
                  className="mt-3 text-sm text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
                >
                  View schedule →
                </button>
              </div>
            )}
          </SectionCard>

          {/* Activity Metrics — real data */}
          <SectionCard title="Activity Overview">
            <div className="space-y-3">
              {[
                { label: 'Sequences active', value: isLoading ? '…' : activeSequences, color: 'bg-indigo-500' },
                { label: 'Emails sent (7d)', value: isLoading ? '…' : emailsSent7d, color: 'bg-violet-500' },
                { label: 'Meetings this week', value: isLoading ? '…' : upcomingMeetings, color: 'bg-blue-500' },
                { label: 'Active deals', value: isLoading ? '…' : activeDeals, color: 'bg-emerald-500' },
              ].map(({ label, value, color }) => (
                <div key={label} className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${color}`} />
                  <span className="flex-1 text-sm text-gray-600 dark:text-gray-400">{label}</span>
                  <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{value}</span>
                </div>
              ))}
            </div>
          </SectionCard>

          {/* Quick Actions */}
          <SectionCard title="Quick Actions">
            <div className="space-y-1">
              {QUICK_ACTIONS.map(({ label, path, icon: Icon }) => (
                <button
                  key={path}
                  onClick={() => navigate(path)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 hover:text-indigo-700 dark:hover:text-indigo-300 rounded-lg transition-colors text-left group"
                >
                  <div className="w-7 h-7 rounded-lg bg-gray-100 dark:bg-gray-700 group-hover:bg-indigo-100 dark:group-hover:bg-indigo-900/40 flex items-center justify-center transition-colors flex-shrink-0">
                    <Icon className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400" />
                  </div>
                  {label}
                </button>
              ))}
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  )
}
