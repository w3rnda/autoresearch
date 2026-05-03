import apiClient from './client'

export const sequencesApi = {
  /**
   * Fetch all sequences.
   */
  getSequences: () => apiClient.get('/sequences'),

  /**
   * Create a new sequence.
   * @param {Object} data - { name, description, isActive, ... }
   */
  createSequence: (data) => apiClient.post('/sequences', data),

  /**
   * Fetch a single sequence with its steps.
   * @param {string} id
   */
  getSequenceById: (id) => apiClient.get(`/sequences/${id}`),

  /**
   * Update sequence metadata.
   * @param {string} id
   * @param {Object} data
   */
  updateSequence: (id, data) => apiClient.put(`/sequences/${id}`, data),

  /**
   * Delete a sequence.
   * @param {string} id
   */
  deleteSequence: (id) => apiClient.delete(`/sequences/${id}`),

  /**
   * Add a step to a sequence.
   * @param {string} id - sequence ID
   * @param {Object} data - { type, delayDays, subject, body, ... }
   */
  addStep: (id, data) => apiClient.post(`/sequences/${id}/steps`, data),

  /**
   * Update a specific step within a sequence.
   * @param {string} id - sequence ID
   * @param {string} stepId
   * @param {Object} data
   */
  updateStep: (id, stepId, data) =>
    apiClient.put(`/sequences/${id}/steps/${stepId}`, data),

  /**
   * Delete a step from a sequence.
   * @param {string} id - sequence ID
   * @param {string} stepId
   */
  deleteStep: (id, stepId) =>
    apiClient.delete(`/sequences/${id}/steps/${stepId}`),

  /**
   * Enroll an array of lead IDs into a sequence.
   * @param {string} id - sequence ID
   * @param {string[]} leadIds
   */
  enrollLeads: (id, leadIds) =>
    apiClient.post(`/sequences/${id}/enroll`, { leadIds }),

  /**
   * Get all enrollments for a sequence.
   * @param {string} id
   */
  getEnrollments: (id) => apiClient.get(`/sequences/${id}/enrollments`),

  /**
   * Reorder steps within a sequence.
   * @param {string} sequenceId
   * @param {Array<{id: string, order: number}>} steps
   */
  reorderSteps: (sequenceId, steps) =>
    apiClient.put(`/sequences/${sequenceId}/steps/reorder`, { steps }),
}
