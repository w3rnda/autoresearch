import apiClient from './client'

export const workspaceApi = {
  /** Get or auto-create workspace for a lead */
  getByLead: (leadId) => apiClient.get(`/workspace/lead/${leadId}`),

  /** Advance / set the current closing stage */
  updateStage: (workspaceId, stage) =>
    apiClient.put(`/workspace/${workspaceId}/stage`, { stage }),

  /** Save workspace-level notes */
  updateNotes: (workspaceId, notes) =>
    apiClient.put(`/workspace/${workspaceId}/notes`, { notes }),

  /** Upsert deal summary */
  upsertSummary: (workspaceId, data) =>
    apiClient.put(`/workspace/${workspaceId}/summary`, data),

  /** Upload a document (multipart) */
  uploadDocument: (workspaceId, formData) =>
    apiClient.post(`/workspace/${workspaceId}/documents`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),

  /** Update document metadata */
  updateDocument: (workspaceId, docId, data) =>
    apiClient.put(`/workspace/${workspaceId}/documents/${docId}`, data),

  /** Delete a document */
  deleteDocument: (workspaceId, docId) =>
    apiClient.delete(`/workspace/${workspaceId}/documents/${docId}`),

  /** Add a payment */
  createPayment: (workspaceId, data) =>
    apiClient.post(`/workspace/${workspaceId}/payments`, data),

  /** Update payment (e.g. mark as paid) */
  updatePayment: (workspaceId, paymentId, data) =>
    apiClient.put(`/workspace/${workspaceId}/payments/${paymentId}`, data),

  /** Delete a payment */
  deletePayment: (workspaceId, paymentId) =>
    apiClient.delete(`/workspace/${workspaceId}/payments/${paymentId}`),
}
