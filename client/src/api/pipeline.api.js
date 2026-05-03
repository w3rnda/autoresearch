import apiClient from './client'

/**
 * Transform the backend response into the shape the Kanban board needs:
 *   { pipeline, columns: { [stageKey]: [...deals] }, stages: [...stageObjects] }
 */
function transformPipelineResponse(res) {
  const raw = res.data?.data || {}
  const pipeline = raw.pipeline || null
  const stageMap = raw.stages || {}

  // Build ordered stage list from the pipeline config
  const stages = pipeline?.stages
    ? [...pipeline.stages].sort((a, b) => a.order - b.order)
    : []

  // Build columns keyed by stage key
  const columns = {}
  for (const stage of stages) {
    const bucket = stageMap[stage.key] || {}
    columns[stage.key] = (bucket.deals || []).map((d) => ({ ...d }))
  }

  return { ...res, data: { ...res.data, data: { pipeline, stages, columns } } }
}

export const pipelineApi = {
  /**
   * Fetch deals for a specific pipeline (or the default).
   * Returns { pipeline, stages, columns }.
   */
  getPipeline: ({ pipelineId, source } = {}) => {
    const params = {}
    if (pipelineId) params.pipelineId = pipelineId
    if (source) params.source = source
    return apiClient.get('/pipeline', { params }).then(transformPipelineResponse)
  },

  /** Create a deal. Pass stage as the raw key (e.g. "NEW", "CAPTURED"). */
  createDeal: (data) => apiClient.post('/pipeline', data),

  /** Update a deal. Pass stage as the raw key. */
  updateDeal: (id, data) => apiClient.put(`/pipeline/${id}`, data),

  /** Delete a deal. */
  deleteDeal: (id) => apiClient.delete(`/pipeline/${id}`),
}
