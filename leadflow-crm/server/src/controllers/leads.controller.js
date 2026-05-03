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
    const {
      firstName, lastName, email, phone, company, source, status, tags, assignedToId,
      title, website, country, city, address, linkedIn, twitter,
      category, industry, companySize, icpFit, notes, customFields,
    } = req.body;
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
      title: title || null,
      website: website || null,
      country: country || null,
      city: city || null,
      address: address || null,
      linkedIn: linkedIn || null,
      twitter: twitter || null,
      category: category || null,
      industry: industry || null,
      companySize: companySize || null,
      icpFit: icpFit || null,
      notes: notes || null,
      customFields: customFields || undefined,
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

    const {
      firstName, lastName, email, phone, company, status, tags, score, assignedToId,
      title, website, country, city, address, linkedIn, twitter,
      category, industry, companySize, icpFit, notes, customFields,
    } = req.body;

    // If email is changing, check for duplicates
    if (email && email !== existing.email) {
      const duplicate = await prisma.lead.findFirst({
        where: { email, organizationId, NOT: { id } },
      });
      if (duplicate) {
        return res.status(409).json(errorResponse('A lead with this email already exists'));
      }
    }

    const updateData = {};
    const fields = {
      firstName, lastName, email, phone, company, status, tags, score, assignedToId,
      title, website, country, city, address, linkedIn, twitter,
      category, industry, companySize, icpFit, notes, customFields,
    };
    for (const [key, val] of Object.entries(fields)) {
      if (val !== undefined) updateData[key] = val;
    }

    const updated = await prisma.lead.update({
      where: { id },
      data: updateData,
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
    const updateExisting = req.body?.updateExisting === 'true';
    // Strip BOM (byte order mark) that Excel/Google Sheets may prepend
    let csvContent = req.file.buffer.toString('utf-8').replace(/^\uFEFF/, '');

    // Auto-detect delimiter: if first line has more tabs or semicolons than commas, use that
    const firstLine = csvContent.split('\n')[0] || '';
    const commaCount = (firstLine.match(/,/g) || []).length;
    const tabCount = (firstLine.match(/\t/g) || []).length;
    const semiCount = (firstLine.match(/;/g) || []).length;
    let delimiter = ',';
    if (tabCount > commaCount && tabCount > semiCount) delimiter = '\t';
    else if (semiCount > commaCount) delimiter = ';';

    let records;
    try {
      records = parse(csvContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        delimiter,
        relax_column_count: true,
        relax_quotes: true,
      });
    } catch (parseError) {
      return res.status(400).json(errorResponse(`CSV parse error: ${parseError.message}`));
    }

    if (!records || records.length === 0) {
      return res.status(400).json(errorResponse('CSV file has no data rows'));
    }

    // Known column names that map to structured Lead fields (case-insensitive)
    const KNOWN_KEYS = new Set([
      '#', 'firstname', 'first_name', 'first name', 'lastname', 'last_name', 'last name',
      'name', 'full name', 'full_name', 'contact',
      'email', 'e-mail', 'email address', 'email_address',
      'phone', 'telephone', 'phone number', 'phone_number', 'mobile',
      'company', 'organization', 'company name', 'company_name',
      'title', 'job_title', 'job title', 'position', 'role',
      'website', 'url', 'web', 'site', 'company website', 'company_website',
      'country', 'nation', 'city', 'location', 'address', 'street', 'street address',
      'linkedin', 'linked_in', 'linkedin url', 'linkedin_url',
      'twitter', 'x', 'twitter url', 'twitter_url',
      'category', 'categories', 'business category', 'type',
      'industry', 'sector', 'vertical',
      'company size', 'company_size', 'companysize', 'employees', 'size',
      'icp fit', 'icp_fit', 'icpfit', 'icp', 'fit', 'fit score',
      'notes', 'note', 'comments', 'comment', 'description',
      'tags', 'tag', 'labels',
      'status', 'lead_status', 'lead status',
      'source', 'lead_source', 'lead source',
    ]);

    // Normalize column names — map common alternate headers to the expected fields
    const normalizeRow = (raw) => {
      const get = (...keys) => {
        for (const k of keys) {
          if (raw[k] !== undefined && raw[k] !== '') return raw[k];
          const lower = k.toLowerCase();
          const found = Object.keys(raw).find((h) => h.toLowerCase() === lower);
          if (found && raw[found] !== undefined && raw[found] !== '') return raw[found];
        }
        return '';
      };

      // Handle combined "Name" column → split into firstName / lastName
      let firstName = get('firstName', 'first_name', 'First Name');
      let lastName = get('lastName', 'last_name', 'Last Name');
      if (!firstName && !lastName) {
        const fullName = get('Name', 'name', 'Full Name', 'full_name', 'Contact', 'contact');
        if (fullName) {
          const parts = fullName.trim().split(/\s+/);
          firstName = parts[0] || '';
          lastName = parts.slice(1).join(' ') || '';
        }
      }

      const email = get('email', 'Email', 'e-mail', 'E-mail', 'Email Address', 'email_address');
      const phone = get('phone', 'Phone', 'telephone', 'Telephone', 'Phone Number', 'phone_number', 'Mobile', 'mobile');
      const company = get('company', 'Company', 'organization', 'Organization', 'Company Name', 'company_name');
      const title = get('title', 'Title', 'job_title', 'Job Title', 'Position', 'position', 'Role', 'role');
      const website = get('website', 'Website', 'url', 'URL', 'Web', 'Site', 'Company Website', 'company_website');
      const country = get('country', 'Country', 'nation');
      const city = get('city', 'City', 'location', 'Location');
      const address = get('address', 'Address', 'street', 'Street', 'Street Address');
      const linkedIn = get('linkedin', 'LinkedIn', 'linked_in', 'LinkedIn URL', 'linkedin_url');
      const twitter = get('twitter', 'Twitter', 'x', 'X', 'Twitter URL', 'twitter_url');
      const category = get('category', 'Category', 'categories', 'Business Category', 'type', 'Type');
      const industry = get('industry', 'Industry', 'sector', 'Sector', 'vertical', 'Vertical');
      const companySize = get('company size', 'Company Size', 'company_size', 'companySize', 'employees', 'Employees', 'size');
      const icpFit = get('icp fit', 'ICP Fit', 'icp_fit', 'icpFit', 'ICP', 'fit', 'Fit Score');
      const notes = get('notes', 'Notes', 'note', 'Note', 'comments', 'Comments', 'description', 'Description');
      const status = get('status', 'Status', 'lead_status');
      const rawTags = get('tags', 'Tags', 'tag', 'labels', 'Labels');

      // Build tags from tags column + category metadata
      const tagParts = [];
      if (rawTags) {
        tagParts.push(...rawTags.split(rawTags.includes('|') ? '|' : ',').map((t) => t.trim()).filter(Boolean));
      }
      if (category) tagParts.push(category);

      // Capture ALL unrecognized columns into customFields JSON
      const customFields = {};
      for (const [header, value] of Object.entries(raw)) {
        if (!value || !value.trim()) continue;
        if (KNOWN_KEYS.has(header.toLowerCase())) continue;
        customFields[header] = value.trim();
      }

      return {
        firstName, lastName, email, phone, company, title, website,
        country, city, address, linkedIn, twitter, category, industry,
        companySize, icpFit, notes, status, tags: tagParts,
        customFields: Object.keys(customFields).length > 0 ? customFields : null,
      };
    };

    const errors = [];
    const toCreate = [];
    const skipped = [];

    for (let i = 0; i < records.length; i++) {
      const raw = records[i];
      const rowNum = i + 2; // 1-indexed + header row

      // Skip rows that are completely empty or are index-only (e.g. "#" column)
      const values = Object.values(raw).filter((v) => v && v.trim());
      if (values.length === 0) continue;

      const row = normalizeRow(raw);

      // Validate required fields — only firstName is strictly required; lastName defaults to '-'
      if (!row.firstName) {
        errors.push({ row: rowNum, reason: 'Missing name (need at least a Name or firstName column)' });
        continue;
      }
      if (!row.lastName) {
        row.lastName = '-';
      }

      // Email: take the first one if multiple are pipe-separated
      let email = row.email;
      if (email && email.includes('|')) {
        email = email.split('|').map((e) => e.trim()).find((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) || email.split('|')[0].trim();
      }
      // Try to extract email from "Via domain.com" pattern
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        const viaMatch = (row.email || '').match(/^via\s+(\S+)/i);
        if (viaMatch) {
          email = `info@${viaMatch[1]}`;
        }
      }
      if (!email) {
        errors.push({ row: rowNum, reason: 'Missing email' });
        continue;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errors.push({ row: rowNum, reason: `Invalid email: ${email}` });
        continue;
      }

      // Phone: take the first one if multiple are pipe-separated
      let phone = row.phone || null;
      if (phone && phone.includes('|')) {
        phone = phone.split('|')[0].trim();
      }

      toCreate.push({
        firstName: row.firstName,
        lastName: row.lastName,
        email: email.toLowerCase(),
        phone,
        company: row.company || null,
        title: row.title || null,
        website: row.website || null,
        country: row.country || null,
        city: row.city || null,
        address: row.address || null,
        linkedIn: row.linkedIn || null,
        twitter: row.twitter || null,
        category: row.category || null,
        industry: row.industry || null,
        companySize: row.companySize || null,
        icpFit: row.icpFit || null,
        notes: row.notes || null,
        customFields: row.customFields,
        source: 'CSV',
        status: ['COLD', 'WARM', 'HOT', 'CUSTOMER'].includes(row.status) ? row.status : 'COLD',
        tags: row.tags.length > 0 ? row.tags : [],
        score: 0,
        engagementScore: 0,
        fitScore: 0,
        organizationId,
      });
    }

    // Check for existing emails in DB
    const existingLeads = await prisma.lead.findMany({
      where: { organizationId, email: { in: toCreate.map((l) => l.email) } },
      select: { id: true, email: true },
    });
    const existingEmailMap = new Map(existingLeads.map((l) => [l.email, l.id]));

    const toInsert = [];
    const toUpdate = [];
    for (const lead of toCreate) {
      if (existingEmailMap.has(lead.email)) {
        if (updateExisting) {
          toUpdate.push({ ...lead, id: existingEmailMap.get(lead.email) });
        } else {
          skipped.push({ email: lead.email, reason: 'Duplicate email' });
        }
      } else {
        toInsert.push(lead);
      }
    }

    let imported = 0;
    let updated = 0;

    // Insert new leads
    if (toInsert.length > 0) {
      const assignments = await assignBatchRoundRobin(organizationId, toInsert.length);
      const insertData = toInsert.map((lead, idx) => ({
        ...lead,
        assignedToId: assignments[idx] || null,
      }));
      const result = await prisma.lead.createMany({ data: insertData, skipDuplicates: true });
      imported = result.count;
    }

    // Update existing leads
    if (toUpdate.length > 0) {
      for (const lead of toUpdate) {
        const { id, organizationId: _orgId, score, engagementScore, fitScore, ...updateData } = lead;
        await prisma.lead.update({ where: { id }, data: updateData });
      }
      updated = toUpdate.length;
    }

    return res.status(200).json(
      successResponse(
        { imported, updated, skipped: skipped.length, errors: errors.length, errorDetails: errors, skippedDetails: skipped },
        `Import complete: ${imported} new, ${updated} updated, ${skipped.length} skipped, ${errors.length} errors`
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
