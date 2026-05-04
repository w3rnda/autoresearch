import apiClient from './client'

export const gtmApi = {
  // Workspaces
  listWorkspaces: (params) => apiClient.get('/gtm/workspaces', { params }),
  getWorkspace: (id) => apiClient.get(`/gtm/workspaces/${id}`),
  createWorkspace: (data) => apiClient.post('/gtm/workspaces', data),
  updateWorkspace: (id, data) => apiClient.put(`/gtm/workspaces/${id}`, data),
  deleteWorkspace: (id) => apiClient.delete(`/gtm/workspaces/${id}`),

  // Activation & Sourcing
  activateWorkspace: (id) => apiClient.post(`/gtm/workspaces/${id}/activate`),
  triggerSourcing: (id, data) => apiClient.post(`/gtm/workspaces/${id}/source`, data),
  ingestEntities: (id, data) => apiClient.post(`/gtm/workspaces/${id}/ingest`, data),
  listSourcingRuns: (id, params) => apiClient.get(`/gtm/workspaces/${id}/runs`, { params }),

  // Entities
  listEntities: (workspaceId, params) => apiClient.get(`/gtm/workspaces/${workspaceId}/entities`, { params }),
  getEntity: (workspaceId, entityId) => apiClient.get(`/gtm/workspaces/${workspaceId}/entities/${entityId}`),
  promoteEntity: (workspaceId, entityId) => apiClient.post(`/gtm/workspaces/${workspaceId}/entities/${entityId}/promote`),

  // AI Scoring (Claude API)
  scoreWorkspace: (id, data = {}) => apiClient.post(`/gtm/workspaces/${id}/score`, data),
  scoreEntity: (workspaceId, entityId, data = {}) =>
    apiClient.post(`/gtm/workspaces/${workspaceId}/entities/${entityId}/score`, data),

  // Email finder (Hunter.io with pattern fallback)
  findEntityEmails: (workspaceId, entityId) =>
    apiClient.post(`/gtm/workspaces/${workspaceId}/entities/${entityId}/find-emails`),
}
