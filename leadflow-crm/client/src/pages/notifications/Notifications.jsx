import { useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Bell, Info, CheckCircle, AlertTriangle, XCircle, CheckCheck } from 'lucide-react'
import toast from 'react-hot-toast'
import { notificationsApi } from '../../api/notifications.api'
import { formatRelativeTime } from '../../utils/format'
import Button from '../../components/ui/Button'
import Spinner from '../../components/ui/Spinner'

const TYPE_CONFIG = {
  INFO: {
    icon: <Info className="h-5 w-5 text-blue-500" />,
    bg: 'bg-blue-50',
  },
  SUCCESS: {
    icon: <CheckCircle className="h-5 w-5 text-green-500" />,
    bg: 'bg-green-50',
  },
  WARNING: {
    icon: <AlertTriangle className="h-5 w-5 text-yellow-500" />,
    bg: 'bg-yellow-50',
  },
  ERROR: {
    icon: <XCircle className="h-5 w-5 text-red-500" />,
    bg: 'bg-red-50',
  },
}

function groupByDate(notifications) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const todayItems = []
  const earlierItems = []

  for (const n of notifications) {
    const d = new Date(n.createdAt)
    d.setHours(0, 0, 0, 0)
    if (d.getTime() >= today.getTime()) {
      todayItems.push(n)
    } else {
      earlierItems.push(n)
    }
  }

  return { todayItems, earlierItems }
}

function NotificationItem({ notification, onMarkRead }) {
  const config = TYPE_CONFIG[notification.type] || TYPE_CONFIG.INFO
  const isUnread = !notification.read && !notification.isRead

  return (
    <div
      className={`flex items-start gap-4 px-5 py-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors relative ${
        isUnread ? 'bg-indigo-50 dark:bg-indigo-500/10 hover:bg-indigo-50/80 dark:hover:bg-indigo-500/15' : ''
      }`}
      onClick={() => isUnread && onMarkRead(notification.id)}
    >
      {/* Type icon */}
      <div className={`flex-shrink-0 w-9 h-9 rounded-full ${config.bg} dark:bg-white/5 flex items-center justify-center mt-0.5`}>
        {config.icon}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm leading-relaxed ${isUnread ? 'text-gray-900 dark:text-gray-100 font-medium' : 'text-gray-700 dark:text-gray-300'}`}>
          {notification.message}
        </p>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{formatRelativeTime(notification.createdAt)}</p>
      </div>

      {/* Unread dot */}
      {isUnread && (
        <div className="flex-shrink-0 mt-2">
          <span className="block w-2 h-2 rounded-full bg-indigo-600" title="Unread" />
        </div>
      )}
    </div>
  )
}

export default function Notifications() {
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => notificationsApi.getNotifications().then((r) => r.data),
    refetchInterval: 30000,
  })

  // API returns { notifications: [...], unreadCount: N }
  const notifications = data?.data?.notifications ?? []
  const serverUnreadCount = data?.data?.unreadCount ?? 0

  const unreadCount = useMemo(
    () => serverUnreadCount || notifications.filter((n) => !n.read).length,
    [notifications, serverUnreadCount]
  )

  const { todayItems, earlierItems } = useMemo(
    () => groupByDate(notifications),
    [notifications]
  )

  const markReadMutation = useMutation({
    mutationFn: (id) => notificationsApi.markRead(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
    onError: (err) => toast.error(err.response?.data?.error || 'Failed to mark as read'),
  })

  const markAllReadMutation = useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      toast.success('All notifications marked as read')
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed to mark all as read'),
  })

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
          {unreadCount > 0 && (
            <span className="inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-600 text-white">
              {unreadCount}
            </span>
          )}
        </div>
        {unreadCount > 0 && (
          <Button
            variant="secondary"
            size="sm"
            loading={markAllReadMutation.isPending}
            onClick={() => markAllReadMutation.mutate()}
          >
            <CheckCheck className="h-4 w-4" /> Mark all read
          </Button>
        )}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner size="lg" />
        </div>
      ) : notifications.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm text-center py-16">
          <div className="mx-auto w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mb-4">
            <Bell className="h-6 w-6 text-gray-400" />
          </div>
          <p className="text-gray-600 font-medium text-lg">You're all caught up!</p>
          <p className="text-gray-400 text-sm mt-1">No notifications right now. Check back later.</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
          {/* Today group */}
          {todayItems.length > 0 && (
            <>
              <div className="px-5 py-3 bg-gray-50 dark:bg-gray-800/60 border-b border-gray-100 dark:border-gray-800">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Today</p>
              </div>
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {todayItems.map((notification) => (
                  <NotificationItem
                    key={notification.id}
                    notification={notification}
                    onMarkRead={(id) => markReadMutation.mutate(id)}
                  />
                ))}
              </div>
            </>
          )}

          {/* Earlier group */}
          {earlierItems.length > 0 && (
            <>
              <div className="px-5 py-3 bg-gray-50 dark:bg-gray-800/60 border-b border-gray-100 dark:border-gray-800 border-t border-gray-200 dark:border-gray-700">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Earlier</p>
              </div>
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {earlierItems.map((notification) => (
                  <NotificationItem
                    key={notification.id}
                    notification={notification}
                    onMarkRead={(id) => markReadMutation.mutate(id)}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
