import apiClient from './client'

export const segmentsApi = {
  /** List all segments with live lead counts. */
  getSegments: () => apiClient.get('/segments'),

  /**
   * Create a new segment.
   * @param {{ name: string, description?: string, filters: object }} data
   */
  createSegment: (data) => apiClient.post('/segments', data),

  /** Get a single segment by ID with lead count. */
  getSegmentById: (id) => apiClient.get(`/segments/${id}`),

  /**
   * Update an existing segment.
   * @param {string} id
   * @param {{ name?: string, description?: string, filters?: object }} data
   */
  updateSegment: (id, data) => apiClient.put(`/segments/${id}`, data),

  /** Delete a segment. */
  deleteSegment: (id) => apiClient.delete(`/segments/${id}`),

  /**
   * Get paginated leads matching a segment's filters.
   * @param {string} id
   * @param {Object} params - { page, limit }
   */
  getSegmentLeads: (id, params = {}) => apiClient.get(`/segments/${id}/leads`, { params }),

  /**
   * Preview lead count + first 5 leads for ad-hoc filters (no save).
   * @param {object} filters
   */
  previewSegment: (filters) => apiClient.post('/segments/preview', { filters }),
}
