import apiClient from './client'

export const analyticsApi = {
  /**
   * Pipeline funnel with conversion rates per stage.
   * @param {Object} params - { days?: number }
   */
  getFunnel: (params = {}) => apiClient.get('/analytics/funnel', { params }),

  /**
   * Average days spent per pipeline stage (velocity).
   * @param {Object} params - { days?: number }
   */
  getVelocity: (params = {}) => apiClient.get('/analytics/velocity', { params }),

  /**
   * Stale deals exceeding a threshold number of days without a stage change.
   * @param {Object} params - { threshold?: number, days?: number, limit?: number }
   */
  getAging: (params = {}) => apiClient.get('/analytics/aging', { params }),

  /**
   * High-level summary: win rate, avg deal size, pipeline value, etc.
   * @param {Object} params - { days?: number }
   */
  getOverview: (params = {}) => apiClient.get('/analytics/overview', { params }),
}
