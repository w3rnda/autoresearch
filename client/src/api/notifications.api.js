import apiClient from './client'

export const notificationsApi = {
  getNotifications: (params = {}) => apiClient.get('/notifications', { params }),
  markRead: (id) => apiClient.put(`/notifications/${id}/read`),
  markAllRead: () => apiClient.put('/notifications/read-all'),
}
