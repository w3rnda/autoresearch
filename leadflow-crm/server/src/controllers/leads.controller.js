'use strict';

const { parse } = require('csv-parse/sync');
const prisma = require('../prisma');
const { successResponse, errorResponse, paginatedResponse } = require('../utils/response.utils');
const { getPaginationParams, getPaginationMeta } = require('../utils/pagination.utils');
const { recomputeAndPersist, computeFitScore } = require('../services/scoring.service');
const { assignLeadRoundRobin, assignBatchRoundRobin } = require('../services/routing.service');

// Fake enrichment data keyed by common company domains / fallback random pools
const INDUSTRIES = ['SaaS', 'FinTech', 'HealthTech', 'E-commerce', 'EdTech', 'Manufacturing', 'Logistics', 'Consulting'];
const COMPANY_SIZES = ['1-10', '11-50', '51-200', '201-500', '501-1000', '1000+'];

function mockEnrichmentData(email, company) {
  const domain = email ? email.split('@')[1] : null;
  const industryIndex = domain ? domain.charCodeAt(0) % INDUSTRIES.length : Math.floor(Math.random() * INDUSTRIES.length);
  const sizeIndex = company ? company.length % COMPANY_SIZES.length : Math.floor(Math.random() * COMPANY_SIZES.length);
  const slug = (company || domain || 'company').toLowerCase().replace(/[^a-z0-9]/g, '-');

  return {
    industry: INDUSTRIES[industryIndex],
    companySize: COMPANY_SIZES[sizeIndex],
    linkedin: `https://linkedin.com/in/${slug}-${Math.floor(Math.random() * 9999)}`,
    enrichedAt: new Date().toISOString(),
  };
}

/**
 * GET /leads
 * Paginated, filterable by status/source/assignedTo, searchable by name/email/company.
 */
const getLeads = async (req, res, next) => {
  try {
    const { page, limit, skip } = getPaginationParams(req.query);
    const { search, status, source, assignedToId } = req.query;
    const { organizationId } = req.user;

    const where = {
      organizationId,
      ...(status && { status }),
      ...(source && { source }),
      ...(assignedToId && { assignedToId }),
      ...(search && {
        OR: [
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { company: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [leads, total] = await Promise.all([
      prisma.lead.findMany({
        where,
        skip,
        take: limit,
        orderBy: { score: 'desc' },
        include: {
          assignedTo: { select: { id: true, name: true } },
        },
      }),
      prisma.lead.count({ where }),
    ]);

    return res.status(200).json(
      paginatedResponse(leads, getPaginationMeta({ page, limit, total }))
    );
  } catch (error) {
    next(error);
  }
};

/**
 * POST /leads
 * Creates a single lead and auto-assigns to a rep via round-robin.
 */
const createLead = async (req, res, next) => {
  try {
    const { firstName, lastName, email, phone, company, source, status, tags, assignedToId } = req.body;
    const { organizationId } = req.user;

    const existing = await prisma.lead.findFirst({
      where: { email, organizationId },
    });
    if (existing) {
      return res.status(409).json(errorResponse('A lead with this email already exists'));
    }

    // Auto-assign if no explicit assignment provided
    const resolvedAssignedToId = assignedToId || await assignLeadRoundRobin(organizationId);

    const leadData = {
      firstName,
      lastName,
      email,
      phone: phone || null,
      company: company || null,
      source: source || 'MANUAL',
      status: status || 'COLD',
      tags: tags || [],
      score: 0,
      engagementScore: 0,
      fitScore: 0,
      organizationId,
      assignedToId: resolvedAssignedToId,
    };

    const lead = await prisma.lead.create({
      data: leadData,
      include: { assignedTo: { select: { id: true, name: true } } },
    });

    // Compute initial fit score asynchronously
    setImmediate(async () => {
      try {
        await recomputeAndPersist(lead.id);
      } catch (_) { /* ignore */ }
    });

    // Notify assigned rep
    if (resolvedAssignedToId) {
      setImmediate(async () => {
        try {
          await prisma.notification.create({
            data: {
              userId: resolvedAssignedToId,
              message: `New lead assigned: ${firstName} ${lastName}${company ? ` at ${company}` : ''}`,
              type: 'INFO',
            },
          });
        } catch (_) { /* ignore */ }
      });
    }

    return res.status(201).json(successResponse(lead, 'Lead created'));
  } catch (error) {
    next(error);
  }
};

/**
 * GET /leads/:id
 */
const getLeadById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { organizationId } = req.user;

    const lead = await prisma.lead.findFirst({
      where: { id, organizationId },
      include: {
        assignedTo: { select: { id: true, name: true, email: true } },
        deals: {
          include: {
            transitions: { orderBy: { createdAt: 'desc' }, take: 5 },
          },
        },
        meetings: { include: { user: { select: { id: true, name: true, email: true } } } },
        quotes: true,
        enrollments: { include: { sequence: true } },
        emailEvents: { orderBy: { createdAt: 'desc' }, take: 20 },
        workspace: {
          include: {
            progress: { orderBy: { createdAt: 'asc' } },
            documents: { orderBy: { createdAt: 'desc' } },
            summary: true,
            payments: { orderBy: { createdAt: 'asc' } },
          },
        },
      },
    });

    if (!lead) {
      return res.status(404).json(errorResponse('Lead not found'));
    }

    return res.status(200).json(successResponse(lead));
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /leads/:id
 */
const updateLead = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { organizationId } = req.user;

    const existing = await prisma.lead.findFirst({ where: { id, organizationId } });
    if (!existing) {
      return res.status(404).json(errorResponse('Lead not found'));
    }

    const { firstName, lastName, email, phone, company, status, tags, score, assignedToId } = req.body;

    // If email is changing, check for duplicates
    if (email && email !== existing.email) {
      const duplicate = await prisma.lead.findFirst({
        where: { email, organizationId, NOT: { id } },
      });
      if (duplicate) {
        return res.status(409).json(errorResponse('A lead with this email already exists'));
      }
    }

    const updated = await prisma.lead.update({
      where: { id },
      data: {
        ...(firstName !== undefined && { firstName }),
        ...(lastName !== undefined && { lastName }),
        ...(email !== undefined && { email }),
        ...(phone !== undefined && { phone }),
        ...(company !== undefined && { company }),
        ...(status !== undefined && { status }),
        ...(tags !== undefined && { tags }),
        ...(score !== undefined && { score }),
        ...(assignedToId !== undefined && { assignedToId }),
      },
      include: { assignedTo: { select: { id: true, name: true } } },
    });

    // Recompute fit score if company, phone, source, or tags changed
    const fitAffecting = ['company', 'phone', 'source', 'tags'];
    if (fitAffecting.some(f => req.body[f] !== undefined)) {
      setImmediate(async () => {
        try { await recomputeAndPersist(id); } catch (_) { /* ignore */ }
      });
    }

    return res.status(200).json(successResponse(updated, 'Lead updated'));
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /leads/:id
 */
const deleteLead = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { organizationId } = req.user;

    const existing = await prisma.lead.findFirst({ where: { id, organizationId } });
    if (!existing) {
      return res.status(404).json(errorResponse('Lead not found'));
    }

    await prisma.lead.delete({ where: { id } });

    return res.status(200).json(successResponse(null, 'Lead deleted'));
  } catch (error) {
    next(error);
  }
};

/**
 * POST /leads/import
 * Parses uploaded CSV, bulk-creates leads with auto-assignment, returns stats.
 */
const importLeads = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json(errorResponse('CSV file is required'));
    }

    const { organizationId } = req.user;
    const csvContent = req.file.buffer.toString('utf-8');

    let records;
    try {
      records = parse(csvContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      });
    } catch (parseError) {
      return res.status(400).json(errorResponse(`CSV parse error: ${parseError.message}`));
    }

    const REQUIRED_FIELDS = ['firstName', 'lastName', 'email'];
    const errors = [];
    const toCreate = [];
    const skipped = [];

    for (let i = 0; i < records.length; i++) {
      const row = records[i];
      const rowNum = i + 2; // 1-indexed + header row

      // Validate required fields
      const missing = REQUIRED_FIELDS.filter((f) => !row[f]);
      if (missing.length > 0) {
        errors.push({ row: rowNum, reason: `Missing required fields: ${missing.join(', ')}` });
        continue;
      }

      // Basic email validation
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) {
        errors.push({ row: rowNum, reason: `Invalid email: ${row.email}` });
        continue;
      }

      toCreate.push({
        firstName: row.firstName,
        lastName: row.lastName,
        email: row.email.toLowerCase(),
        phone: row.phone || null,
        company: row.company || null,
        source: 'CSV',
        status: ['COLD', 'WARM', 'HOT', 'CUSTOMER'].includes(row.status) ? row.status : 'COLD',
        tags: row.tags ? row.tags.split('|').map((t) => t.trim()).filter(Boolean) : [],
        score: 0,
        engagementScore: 0,
        fitScore: 0,
        organizationId,
      });
    }

    // Check for existing emails in DB to avoid duplicates
    const existingLeads = await prisma.lead.findMany({
      where: { organizationId, email: { in: toCreate.map((l) => l.email) } },
      select: { email: true },
    });
    const existingEmails = new Set(existingLeads.map((l) => l.email));

    const unique = [];
    for (const lead of toCreate) {
      if (existingEmails.has(lead.email)) {
        skipped.push({ email: lead.email, reason: 'Duplicate email' });
      } else {
        unique.push(lead);
      }
    }

    let imported = 0;
    if (unique.length > 0) {
      // Pre-compute round-robin assignments for the batch
      const assignments = await assignBatchRoundRobin(organizationId, unique.length);
      const uniqueWithAssignment = unique.map((lead, idx) => ({
        ...lead,
        assignedToId: assignments[idx] || null,
      }));

      const result = await prisma.lead.createMany({ data: uniqueWithAssignment, skipDuplicates: true });
      imported = result.count;
    }

    return res.status(200).json(
      successResponse(
        { imported, skipped: skipped.length, errors: errors.length, errorDetails: errors, skippedDetails: skipped },
        `Import complete: ${imported} imported, ${skipped.length} skipped, ${errors.length} errors`
      )
    );
  } catch (error) {
    next(error);
  }
};

/**
 * POST /leads/:id/enrich
 * Adds mock enrichment data to the lead and updates fitScore.
 */
const enrichLead = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { organizationId } = req.user;

    const lead = await prisma.lead.findFirst({ where: { id, organizationId } });
    if (!lead) {
      return res.status(404).json(errorResponse('Lead not found'));
    }

    const enrichment = mockEnrichmentData(lead.email, lead.company);
    const newTags = Array.from(new Set([...lead.tags, enrichment.industry]));

    const updated = await prisma.lead.update({
      where: { id },
      data: {
        company: lead.company || enrichment.industry + ' Co.',
        tags: newTags,
      },
      include: { assignedTo: { select: { id: true, name: true } } },
    });

    // Recompute composite score after enrichment
    const scores = await recomputeAndPersist(id);

    const finalLead = { ...updated, ...scores };

    return res.status(200).json(
      successResponse({ lead: finalLead, enrichment }, 'Lead enriched successfully')
    );
  } catch (error) {
    next(error);
  }
};

/**
 * GET /leads/export
 * Streams all matching leads as a CSV file download.
 */
const exportLeads = async (req, res, next) => {
  try {
    const { search, status, source } = req.query;
    const { organizationId } = req.user;

    const where = {
      organizationId,
      ...(status && { status }),
      ...(source && { source }),
      ...(search && {
        OR: [
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { company: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const leads = await prisma.lead.findMany({
      where,
      orderBy: { score: 'desc' },
      include: { assignedTo: { select: { name: true } } },
    });

    function escapeCsvField(value) {
      if (value === null || value === undefined) return '""';
      const str = Array.isArray(value) ? value.join(';') : String(value);
      return `"${str.replace(/"/g, '""')}"`;
    }

    const header = 'id,firstName,lastName,email,phone,company,status,source,score,engagementScore,fitScore,tags,assignedTo,createdAt\n';

    const rows = leads.map((lead) => [
      escapeCsvField(lead.id),
      escapeCsvField(lead.firstName),
      escapeCsvField(lead.lastName),
      escapeCsvField(lead.email),
      escapeCsvField(lead.phone),
      escapeCsvField(lead.company),
      escapeCsvField(lead.status),
      escapeCsvField(lead.source),
      escapeCsvField(lead.score),
      escapeCsvField(lead.engagementScore),
      escapeCsvField(lead.fitScore),
      escapeCsvField(lead.tags),
      escapeCsvField(lead.assignedTo?.name || ''),
      escapeCsvField(lead.createdAt),
    ].join(','));

    const csv = header + rows.join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="leads.csv"');
    return res.status(200).send(csv);
  } catch (error) {
    next(error);
  }
};

/**
 * POST /leads/:id/de-enrich
 * Reverses the enrichment: removes auto-added industry tags and recomputes score.
 */
const deenrichLead = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { organizationId } = req.user;

    const lead = await prisma.lead.findFirst({ where: { id, organizationId } });
    if (!lead) {
      return res.status(404).json(errorResponse('Lead not found'));
    }

    // Remove any tags that were auto-added by enrichment (industry tags)
    const cleanedTags = (lead.tags || []).filter((t) => !INDUSTRIES.includes(t));

    await prisma.lead.update({
      where: { id },
      data: { tags: cleanedTags },
    });

    // Recompute score after de-enrichment
    const scores = await recomputeAndPersist(id);

    const updated = await prisma.lead.findUnique({
      where: { id },
      include: { assignedTo: { select: { id: true, name: true } } },
    });

    return res.status(200).json(successResponse({ ...updated, ...scores }, 'Lead enrichment reversed'));
  } catch (error) {
    next(error);
  }
};

module.exports = { getLeads, createLead, getLeadById, updateLead, deleteLead, importLeads, enrichLead, deenrichLead, exportLeads };
