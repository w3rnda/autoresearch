'use strict';

const prisma = require('../../prisma');

/**
 * Deduplicate and insert entities from a sourcing batch.
 *
 * Dedup strategy (in priority order):
 * 1. placeId match (Google Maps) — strongest identifier
 * 2. domain match (extracted from website/email)
 * 3. name + city fuzzy match (last resort)
 *
 * @param {string} workspaceId
 * @param {Array} rawEntities - Array of raw entity objects from source
 * @param {string} source - GtmEntitySource enum value
 * @param {string} sourceRef - External reference (Apify run ID, etc.)
 * @returns {{ created: number, duplicates: number, total: number }}
 */
async function deduplicateAndInsert(workspaceId, rawEntities, source, sourceRef) {
  let created = 0;
  let duplicates = 0;

  for (const raw of rawEntities) {
    const name = raw.title || raw.name || raw.searchString || 'Unknown';
    const website = raw.website || raw.url || null;
    const domain = extractDomain(website || raw.email || '');
    const placeId = raw.placeId || raw.place_id || null;
    const email = raw.email || raw.emails?.[0] || null;
    const phone = raw.phone || raw.phoneUnformatted || raw.phones?.[0] || null;

    // Check for duplicates
    const isDuplicate = await checkDuplicate(workspaceId, { placeId, domain, name, city: raw.city });

    if (isDuplicate) {
      duplicates++;
      continue;
    }

    // Create new entity
    await prisma.gtmEntity.create({
      data: {
        workspaceId,
        name,
        email,
        phone,
        website,
        domain,
        placeId,
        rawData: raw,
        source,
        sourceRef,
        status: 'NEW',
      },
    });

    created++;
  }

  return { created, duplicates, total: rawEntities.length };
}

/**
 * Check if an entity already exists in this workspace.
 */
async function checkDuplicate(workspaceId, { placeId, domain, name, city }) {
  // Strategy 1: placeId match (strongest)
  if (placeId) {
    const existing = await prisma.gtmEntity.findFirst({
      where: { workspaceId, placeId },
      select: { id: true },
    });
    if (existing) return true;
  }

  // Strategy 2: domain match
  if (domain) {
    const existing = await prisma.gtmEntity.findFirst({
      where: { workspaceId, domain },
      select: { id: true },
    });
    if (existing) return true;
  }

  // Strategy 3: name + city fuzzy match (case insensitive)
  if (name && city) {
    const existing = await prisma.gtmEntity.findFirst({
      where: {
        workspaceId,
        name: { equals: name, mode: 'insensitive' },
        rawData: { path: ['city'], equals: city },
      },
      select: { id: true },
    });
    if (existing) return true;
  }

  return false;
}

/**
 * Extract root domain from a URL or email.
 * "https://www.example.com/page" → "example.com"
 * "info@example.com" → "example.com"
 */
function extractDomain(input) {
  if (!input) return null;

  try {
    // Handle email
    if (input.includes('@') && !input.includes('://')) {
      const emailDomain = input.split('@')[1];
      return emailDomain ? emailDomain.toLowerCase() : null;
    }

    // Handle URL
    let url = input;
    if (!url.startsWith('http')) {
      url = `https://${url}`;
    }
    const parsed = new URL(url);
    const hostname = parsed.hostname.replace(/^www\./, '');
    return hostname || null;
  } catch {
    return null;
  }
}

module.exports = {
  deduplicateAndInsert,
  checkDuplicate,
  extractDomain,
};
