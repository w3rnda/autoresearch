'use strict'

function successResponse(data, message) {
  const body = { success: true, data: data !== undefined ? data : null }
  if (message) body.message = message
  return body
}

function errorResponse(message, details) {
  const body = { success: false, error: message }
  if (details !== undefined && details !== null) body.details = details
  return body
}

function paginatedResponse(data, pagination) {
  return { success: true, data, pagination }
}

module.exports = { successResponse, errorResponse, paginatedResponse }
