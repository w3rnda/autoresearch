import apiClient from './client'

export const pipelinesApi = {
  /** List all pipelines for the org (with deal counts). */
  getPipelines: () => apiClient.get('/pipelines'),

  /** Return all built-in templates. */
  getTemplates: () => apiClient.get('/pipelines/templates'),

  /** Create a pipeline — pass { name?, type?, description?, stages? }. */
  createPipeline: (data) => apiClient.post('/pipelines', data),

  /** Update name / description. */
  updatePipeline: (id, data) => apiClient.put(`/pipelines/${id}`, data),

  /** Set a pipeline as the org default. */
  setDefault: (id) => apiClient.put(`/pipelines/${id}/default`),

  /** Delete a pipeline (must not be the last one). */
  deletePipeline: (id) => apiClient.delete(`/pipelines/${id}`),
}
