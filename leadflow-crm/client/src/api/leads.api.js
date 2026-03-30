import apiClient from './client'

export const leadsApi = {
  /**
   * Fetch paginated leads with optional filters.
   * @param {Object} params - query params: page, limit, search, status, assignedTo, etc.
   */
  getLeads: (params = {}) => apiClient.get('/leads', { params }),

  /**
   * Create a new lead.
   * @param {Object} data - lead fields
   */
  createLead: (data) => apiClient.post('/leads', data),

  /**
   * Fetch a single lead by ID.
   * @param {string} id
   */
  getLeadById: (id) => apiClient.get(`/leads/${id}`),

  /**
   * Update an existing lead.
   * @param {string} id
   * @param {Object} data - partial lead fields to update
   */
  updateLead: (id, data) => apiClient.put(`/leads/${id}`, data),

  /**
   * Delete a lead by ID.
   * @param {string} id
   */
  deleteLead: (id) => apiClient.delete(`/leads/${id}`),

  /**
   * Bulk import leads from a CSV/Excel file.
   * @param {FormData} formData - must contain a 'file' field
   */
  importLeads: (formData) =>
    apiClient.post('/leads/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),

  /**
   * Trigger AI enrichment for a lead (company info, social profiles, etc.).
   * @param {string} id
   */
  enrichLead: (id) => apiClient.post(`/leads/${id}/enrich`),

  /**
   * Reverse enrichment — removes the score bump and auto-added industry tags.
   * @param {string} id
   */
  deenrichLead: (id) => apiClient.post(`/leads/${id}/de-enrich`),
}
