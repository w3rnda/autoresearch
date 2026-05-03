'use strict';

const prisma = require('../prisma');
const { successResponse, errorResponse, paginatedResponse } = require('../utils/response.utils');
const { getPaginationParams, getPaginationMeta } = require('../utils/pagination.utils');

const VALID_STATUSES = ['COLD', 'WARM', 'HOT', 'CUSTOMER'];
const VALID_SOURCES = ['MANUAL', 'CSV', 'API', 'WEBSITE', 'REFERRAL', 'COLD_OUTREACH', 'SOCIAL_MEDIA', 'EVENT', 'OTHER'];

/**
 * Converts a segment's filter JSON into a Prisma Lead `where` clause.
 * Validates each filter key against an allowlist to prevent injection.
 *
 * @param {object} filters
 * @param {string} organizationId
 * @returns {object} Prisma where clause
 */
function buildWhereFromFilters(filters, organizationId) {
  const where = { organizationId };

  if (filters.status && Array.isArray(filters.status) && filters.status.length > 0) {
    const validStatuses = filters.status.filter(s => VALID_STATUSES.includes(s));
    if (validStatuses.length > 0) where.status = { in: validStatuses };
  }

  if (filters.source && Array.isArray(filters.source) && filters.source.length > 0) {
    const validSources = filters.source.filter(s => VALID_SOURCES.includes(s));
    if (validSources.length > 0) where.source = { in: validSources };
  }

  if (typeof filters.scoreMin === 'number' || typeof filters.scoreMax === 'number') {
    where.score = {};
    if (typeof filters.scoreMin === 'number') where.score.gte = filters.scoreMin;
    if (typeof filters.scoreMax === 'number') where.score.lte = filters.scoreMax;
  }

  if (filters.tags && Array.isArray(filters.tags) && filters.tags.length > 0) {
    where.tags = { hasSome: filters.tags };
  }

  if (filters.assignedToId && typeof filters.assignedToId === 'string') {
    where.assignedToId = filters.assignedToId;
  }

  if (filters.createdAfter && typeof filters.createdAfter === 'string') {
    const date = new Date(filters.createdAfter);
    if (!isNaN(date.getTime())) {
      where.createdAt = { ...where.createdAt, gte: date };
    }
  }

  if (filters.createdBefore && typeof filters.createdBefore === 'string') {
    const date = new Date(filters.createdBefore);
    if (!isNaN(date.getTime())) {
      where.createdAt = { ...where.createdAt, lte: date };
    }
  }

  if (filters.search && typeof filters.search === 'string') {
    const search = filters.search.trim();
    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { company: { contains: search, mode: 'insensitive' } },
      ];
    }
  }

  return where;
}

/**
 * GET /segments
 * List all segments for the org, each with a live leadCount.
 */
const getSegments = async (req, res, next) => {
  try {
    const { organizationId } = req.user;

    const segments = await prisma.segment.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });

    // Attach live lead counts
    const withCounts = await Promise.all(
      segments.map(async (seg) => {
        const where = buildWhereFromFilters(seg.filters || {}, organizationId);
        const leadCount = await prisma.lead.count({ where });
        return { ...seg, leadCount };
      })
    );

    return res.json(successResponse(withCounts));
  } catch (error) {
    next(error);
  }
};

/**
 * POST /segments
 * Create a new segment.
 */
const createSegment = async (req, res, next) => {
  try {
    const { organizationId } = req.user;
    const { name, description, filters } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json(errorResponse('Segment name is required'));
    }

    const segment = await prisma.segment.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        filters: filters || {},
        organizationId,
      },
    });

    return res.status(201).json(successResponse(segment, 'Segment created'));
  } catch (error) {
    next(error);
  }
};

/**
 * GET /segments/:id
 * Fetch a single segment by ID.
 */
const getSegmentById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { organizationId } = req.user;

    const segment = await prisma.segment.findFirst({ where: { id, organizationId } });
    if (!segment) return res.status(404).json(errorResponse('Segment not found'));

    const where = buildWhereFromFilters(segment.filters || {}, organizationId);
    const leadCount = await prisma.lead.count({ where });

    return res.json(successResponse({ ...segment, leadCount }));
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /segments/:id
 * Update segment name, description, or filters.
 */
const updateSegment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { organizationId } = req.user;
    const { name, description, filters } = req.body;

    const existing = await prisma.segment.findFirst({ where: { id, organizationId } });
    if (!existing) return res.status(404).json(errorResponse('Segment not found'));

    const updated = await prisma.segment.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(description !== undefined && { description: description?.trim() || null }),
        ...(filters !== undefined && { filters }),
      },
    });

    return res.json(successResponse(updated, 'Segment updated'));
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /segments/:id
 */
const deleteSegment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { organizationId } = req.user;

    const existing = await prisma.segment.findFirst({ where: { id, organizationId } });
    if (!existing) return res.status(404).json(errorResponse('Segment not found'));

    await prisma.segment.delete({ where: { id } });
    return res.json(successResponse(null, 'Segment deleted'));
  } catch (error) {
    next(error);
  }
};

/**
 * GET /segments/:id/leads
 * Returns paginated leads matching the segment's filters.
 */
const getSegmentLeads = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { organizationId } = req.user;
    const { page, limit, skip } = getPaginationParams(req.query);

    const segment = await prisma.segment.findFirst({ where: { id, organizationId } });
    if (!segment) return res.status(404).json(errorResponse('Segment not found'));

    const where = buildWhereFromFilters(segment.filters || {}, organizationId);

    const [leads, total] = await Promise.all([
      prisma.lead.findMany({
        where,
        skip,
        take: limit,
        orderBy: { score: 'desc' },
        include: { assignedTo: { select: { id: true, name: true } } },
      }),
      prisma.lead.count({ where }),
    ]);

    return res.json(paginatedResponse(leads, getPaginationMeta({ page, limit, total })));
  } catch (error) {
    next(error);
  }
};

/**
 * POST /segments/preview
 * Returns lead count + first 5 leads for ad-hoc filters (no save).
 */
const previewSegment = async (req, res, next) => {
  try {
    const { organizationId } = req.user;
    const { filters } = req.body;

    if (!filters || typeof filters !== 'object') {
      return res.status(400).json(errorResponse('filters object is required'));
    }

    const where = buildWhereFromFilters(filters, organizationId);

    const [count, leads] = await Promise.all([
      prisma.lead.count({ where }),
      prisma.lead.findMany({
        where,
        take: 5,
        orderBy: { score: 'desc' },
        select: {
          id: true, firstName: true, lastName: true,
          email: true, company: true, status: true, score: true,
        },
      }),
    ]);

    return res.json(successResponse({ count, leads }));
  } catch (error) {
    next(error);
  }
};

module.exports = { getSegments, createSegment, getSegmentById, updateSegment, deleteSegment, getSegmentLeads, previewSegment };
