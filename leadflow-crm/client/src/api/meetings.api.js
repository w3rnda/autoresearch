import apiClient from './client'

export const meetingsApi = {
  getMeetings: (params = {}) => apiClient.get('/meetings', { params }),
  createMeeting: (data) => apiClient.post('/meetings', data),
  getMeetingById: (id) => apiClient.get(`/meetings/${id}`),
  updateMeeting: (id, data) => apiClient.put(`/meetings/${id}`, data),
  deleteMeeting: (id) => apiClient.delete(`/meetings/${id}`),
  getAvailability: (userId) => apiClient.get(`/meetings/availability/${userId}`),
  // Public endpoints (no auth header needed since apiClient adds it only if token exists)
  bookMeeting: (data) => apiClient.post('/meetings/book', data),
}
