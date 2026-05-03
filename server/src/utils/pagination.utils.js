'use strict'

function getPaginationParams(query) {
  const page = Math.max(1, parseInt(query.page) || 1)
  const limit = Math.min(100, Math.max(1, parseInt(query.limit) || 20))
  const skip = (page - 1) * limit
  return { page, limit, skip }
}

function getPaginationMeta({ page, limit, total }) {
  const totalPages = limit > 0 ? Math.ceil(total / limit) : 1
  return { total, page, limit, totalPages, hasNext: page < totalPages, hasPrev: page > 1 }
}

module.exports = { getPaginationParams, getPaginationMeta }
