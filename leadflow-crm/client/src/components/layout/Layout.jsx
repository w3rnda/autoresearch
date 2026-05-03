import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/auth.store'
import { useNotificationsStore } from '../../store/notifications.store'
import { useThemeStore } from '../../store/theme.store'
import { useQuery } from '@tanstack/react-query'
import { notificationsApi } from '../../api/notifications.api'
import { useEffect } from 'react'
import {
  LayoutDashboard, Users, Kanban, Mail, Calendar, FileText,
  Bell, LogOut, Zap, Settings, Sun, Moon, ChevronRight,
  TrendingUp, Layers, Rocket,
} from 'lucide-react'
import GlobalSearch from '../ui/GlobalSearch'

const NAV_SECTIONS = [
  {
    label: 'CRM',
    items: [
      { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
      { to: '/leads', icon: Users, label: 'Leads' },
      { to: '/pipeline', icon: Kanban, label: 'Pipeline' },
      { to: '/segments', icon: Layers, label: 'Segments' },
    ],
  },
  {
    label: 'GTM Engine',
    items: [
      { to: '/gtm', icon: Rocket, label: 'GTM Workspaces' },
    ],
  },
  {
    label: 'Insights',
    items: [
      { to: '/analytics', icon: TrendingUp, label: 'Analytics' },
    ],
  },
  {
    label: 'Engagement',
    items: [
      { to: '/sequences', icon: Mail, label: 'Sequences' },
      { to: '/meetings', icon: Calendar, label: 'Meetings' },
    ],
  },
  {
    label: 'Financials',
    items: [
      { to: '/quotes', icon: FileText, label: 'Quotes' },
    ],
  },
  {
    label: 'Account',
    items: [
      { to: '/notifications', icon: Bell, label: 'Notifications', badge: true },
      { to: '/settings/team', icon: Settings, label: 'Settings' },
    ],
  },
]

export default function Layout() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const { unreadCount, setUnreadCount } = useNotificationsStore()
  const { isDark, toggle } = useThemeStore()

  // Sync dark class with persisted state on mount
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [isDark])

  const { data } = useQuery({
    queryKey: ['notifications-count'],
    queryFn: () => notificationsApi.getNotifications({ read: false }).then(r => r.data.data),
    refetchInterval: 30000,
  })

  useEffect(() => {
    if (data?.unreadCount !== undefined) setUnreadCount(data.unreadCount)
  }, [data, setUnreadCount])

  function handleLogout() {
    logout()
    navigate('/login')
  }

  function handleThemeToggle() {
    toggle()
  }

  const initials = user?.name
    ? user.name.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase()
    : 'U'

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-950 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex flex-col shrink-0">

        {/* Logo */}
        <div className="h-16 flex items-center px-5 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-sm">
              <Zap className="h-4.5 w-4.5 text-white" strokeWidth={2.5} />
            </div>
            <div>
              <span className="text-base font-bold text-gray-900 dark:text-white tracking-tight">LeadFlow</span>
              <span className="text-[10px] font-medium text-indigo-500 dark:text-indigo-400 block leading-none -mt-0.5">CRM</span>
            </div>
          </div>
        </div>

        {/* Nav sections */}
        <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto">
          {NAV_SECTIONS.map(({ label, items }) => (
            <div key={label}>
              <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">
                {label}
              </p>
              <div className="space-y-0.5">
                {items.map(({ to, icon: Icon, label: itemLabel, badge }) => (
                  <NavLink
                    key={to}
                    to={to}
                    className={({ isActive }) =>
                      `group flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
                        isActive
                          ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300 shadow-[inset_2px_0_0_theme(colors.indigo.500)] pl-[11px]'
                          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100'
                      }`
                    }
                  >
                    <Icon className="h-4 w-4 flex-shrink-0" />
                    <span className="flex-1">{itemLabel}</span>
                    {badge && unreadCount > 0 && (
                      <span className="bg-red-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center leading-tight">
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </span>
                    )}
                    {!badge && (
                      <ChevronRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-40 transition-opacity" />
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Theme toggle */}
        <div className="px-3 pb-2">
          <button
            onClick={handleThemeToggle}
            className="flex items-center gap-3 w-full px-3 py-2 text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-200 rounded-lg transition-colors"
            aria-label="Toggle dark mode"
          >
            <div className="h-4 w-4 flex items-center justify-center flex-shrink-0">
              {isDark
                ? <Sun className="h-4 w-4 text-amber-400" />
                : <Moon className="h-4 w-4" />
              }
            </div>
            {isDark ? 'Light mode' : 'Dark mode'}
          </button>
        </div>

        {/* User info + logout */}
        <div className="p-3 border-t border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors mb-1">
            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-indigo-400 to-violet-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate leading-tight">{user?.name}</p>
              <p className="text-[11px] text-gray-400 dark:text-gray-500 truncate capitalize">{user?.role?.replace('_', ' ').toLowerCase()}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-950">
        {/* Top header */}
        <header className="sticky top-0 z-10 h-14 border-b border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm flex items-center px-6 gap-4">
          <GlobalSearch />
        </header>
        <Outlet />
      </main>
    </div>
  )
}
