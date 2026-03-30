import apiClient from './client'

export const quotesApi = {
  getQuotes: (params = {}) => apiClient.get('/quotes', { params }),
  createQuote: (data) => apiClient.post('/quotes', data),
  getQuoteById: (id) => apiClient.get(`/quotes/${id}`),
  updateQuote: (id, data) => apiClient.put(`/quotes/${id}`, data),
  deleteQuote: (id) => apiClient.delete(`/quotes/${id}`),
  downloadPdf: (id) => `${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/v1/quotes/${id}/pdf`,
  sendQuote: (id) => apiClient.post(`/quotes/${id}/send`),
  payQuote: (id) => apiClient.post(`/quotes/${id}/pay`),
}
