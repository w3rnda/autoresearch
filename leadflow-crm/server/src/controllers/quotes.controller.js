'use strict'
const prisma = require('../prisma')
const { successResponse, errorResponse, paginatedResponse } = require('../utils/response.utils')
const { getPaginationParams, getPaginationMeta } = require('../utils/pagination.utils')
const { generateQuotePdf } = require('../utils/pdf.utils')

function calcTotal(items, taxRate) {
  const sub = items.reduce((s, i) => s + (Number(i.qty) || 1) * (Number(i.price) || 0), 0)
  return sub * (1 + (taxRate || 0) / 100)
}

const getQuotes = async (req, res, next) => {
  try {
    const { organizationId } = req.user
    const { page, limit, skip } = getPaginationParams(req.query)
    const { leadId, status } = req.query
    const where = {
      lead: { organizationId },
      ...(leadId && { leadId }),
      ...(status && { status }),
    }
    const [quotes, total] = await Promise.all([
      prisma.quote.findMany({
        where,
        skip,
        take: limit,
        include: {
          lead: { select: { id: true, firstName: true, lastName: true, company: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.quote.count({ where }),
    ])
    return res.json(paginatedResponse(quotes, getPaginationMeta({ page, limit, total })))
  } catch (err) { next(err) }
}

const createQuote = async (req, res, next) => {
  try {
    const { leadId, items, taxRate } = req.body
    const { organizationId } = req.user
    if (!leadId || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json(errorResponse('leadId and items are required'))
    }
    const lead = await prisma.lead.findFirst({ where: { id: leadId, organizationId } })
    if (!lead) return res.status(404).json(errorResponse('Lead not found'))
    const totalAmount = calcTotal(items, taxRate)
    const quote = await prisma.quote.create({
      data: { leadId, items, taxRate: taxRate || 0, totalAmount },
    })
    return res.status(201).json(successResponse(quote, 'Quote created'))
  } catch (err) { next(err) }
}

const getQuoteById = async (req, res, next) => {
  try {
    const { organizationId } = req.user
    const quote = await prisma.quote.findFirst({
      where: { id: req.params.id, lead: { organizationId } },
      include: {
        lead: { select: { id: true, firstName: true, lastName: true, email: true, company: true } },
      },
    })
    if (!quote) return res.status(404).json(errorResponse('Quote not found'))
    return res.json(successResponse(quote))
  } catch (err) { next(err) }
}

const updateQuote = async (req, res, next) => {
  try {
    const { organizationId } = req.user
    const existing = await prisma.quote.findFirst({ where: { id: req.params.id, lead: { organizationId } } })
    if (!existing) return res.status(404).json(errorResponse('Quote not found'))
    if (existing.status !== 'DRAFT') return res.status(400).json(errorResponse('Only DRAFT quotes can be edited'))
    const { items, taxRate } = req.body
    const newItems = items || existing.items
    const newTax = taxRate !== undefined ? taxRate : existing.taxRate
    const totalAmount = calcTotal(newItems, newTax)
    const updated = await prisma.quote.update({
      where: { id: req.params.id },
      data: { items: newItems, taxRate: newTax, totalAmount },
    })
    return res.json(successResponse(updated, 'Quote updated'))
  } catch (err) { next(err) }
}

const deleteQuote = async (req, res, next) => {
  try {
    const { organizationId } = req.user
    const existing = await prisma.quote.findFirst({ where: { id: req.params.id, lead: { organizationId } } })
    if (!existing) return res.status(404).json(errorResponse('Quote not found'))
    await prisma.quote.delete({ where: { id: req.params.id } })
    return res.json(successResponse(null, 'Quote deleted'))
  } catch (err) { next(err) }
}

const downloadQuotePdf = async (req, res, next) => {
  try {
    const { organizationId } = req.user
    const quote = await prisma.quote.findFirst({
      where: { id: req.params.id, lead: { organizationId } },
      include: { lead: true },
    })
    if (!quote) return res.status(404).json(errorResponse('Quote not found'))
    const pdfBuffer = await generateQuotePdf(quote, quote.lead)
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="quote-${quote.id.slice(-8)}.pdf"`)
    return res.send(pdfBuffer)
  } catch (err) { next(err) }
}

const sendQuote = async (req, res, next) => {
  try {
    const { organizationId } = req.user
    const existing = await prisma.quote.findFirst({ where: { id: req.params.id, lead: { organizationId } } })
    if (!existing) return res.status(404).json(errorResponse('Quote not found'))
    // Mock: log email send
    console.log(`[EMAIL] Sending quote ${existing.id} to lead ${existing.leadId}`)
    const updated = await prisma.quote.update({ where: { id: req.params.id }, data: { status: 'SENT' } })
    return res.json(successResponse(updated, 'Quote sent'))
  } catch (err) { next(err) }
}

const payQuote = async (req, res, next) => {
  try {
    const { organizationId } = req.user
    const existing = await prisma.quote.findFirst({ where: { id: req.params.id, lead: { organizationId } } })
    if (!existing) return res.status(404).json(errorResponse('Quote not found'))
    const updated = await prisma.quote.update({ where: { id: req.params.id }, data: { status: 'PAID' } })
    // mark lead as customer
    await prisma.lead.update({ where: { id: existing.leadId }, data: { status: 'CUSTOMER' } })
    return res.json(successResponse(updated, 'Quote marked as paid'))
  } catch (err) { next(err) }
}

module.exports = { getQuotes, createQuote, getQuoteById, updateQuote, deleteQuote, downloadQuotePdf, sendQuote, payQuote }
