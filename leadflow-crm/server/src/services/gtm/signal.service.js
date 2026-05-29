'use strict';

/**
 * Signal Engine — the intent-detection core of the GTM Engine.
 *
 * This is the piece that turns a static lead list into a live opportunity
 * engine: it captures historical snapshots of each entity, computes deltas
 * between the latest two snapshots, and fires intent SIGNALS when a business
 * shows growth/investment behaviour (review velocity, rating change, new
 * website, social growth, etc.).
 *
 * "The real value is not in scraping or automation; it is identifying intent
 *  before competitors do."
 */

const prisma = require('../../prisma');

// Tunable thresholds for what counts as a signal.
const THRESHOLDS = {
  REVIEW_GROWTH_ABS: 10,          // +10 reviews since last snapshot
  REVIEW_GROWTH_PCT: 15,          // or +15%
  RATING_CHANGE_ABS: 0.3,         // rating moved by 0.3 stars
  SOCIAL_GROWTH_PCT: 20,          // socials/followers +20%
};

/**
 * Capture a point-in-time snapshot of the metrics we track for an entity.
 * Pulls from rawData (Google Maps fields) + enrichedData.
 *
 * @param {object} entity - GtmEntity record
 * @returns {Promise<object>} the created EntitySnapshot
 */
async function captureSnapshot(entity) {
  const raw = entity.rawData || {};
  const enriched = entity.enrichedData || {};

  const data = {
    reviewCount: numberOrNull(raw.reviewsCount ?? raw.reviewCount ?? enriched.reviewCount),
    rating: numberOrNull(raw.totalScore ?? raw.rating ?? enriched.rating),
    imagesCount: numberOrNull(raw.imagesCount),
    hasWebsite: Boolean(entity.website || raw.website),
    socialCount: Array.isArray(enriched.socials) ? enriched.socials.length : null,
    employeeCount: numberOrNull(enriched.employeeCount),
  };

  return prisma.entitySnapshot.create({
    data: { entityId: entity.id, data },
  });
}

/**
 * Detect signals for a single entity by comparing its two most recent snapshots.
 * Creates Signal rows for any threshold crossings and returns them.
 *
 * @param {object} entity - GtmEntity (must include workspaceId)
 * @returns {Promise<Array>} created Signal records
 */
async function detectSignals(entity) {
  const snapshots = await prisma.entitySnapshot.findMany({
    where: { entityId: entity.id },
    orderBy: { capturedAt: 'desc' },
    take: 2,
  });

  // Need at least two snapshots to compute a delta.
  if (snapshots.length < 2) return [];

  const [current, previous] = snapshots;
  const cur = current.data || {};
  const prev = previous.data || {};
  const signals = [];

  // ── REVIEW_GROWTH ──────────────────────────────────────────────────────
  if (isNum(cur.reviewCount) && isNum(prev.reviewCount)) {
    const delta = cur.reviewCount - prev.reviewCount;
    const pct = prev.reviewCount > 0 ? (delta / prev.reviewCount) * 100 : 100;
    if (delta >= THRESHOLDS.REVIEW_GROWTH_ABS || pct >= THRESHOLDS.REVIEW_GROWTH_PCT) {
      signals.push(buildSignal(entity, 'REVIEW_GROWTH', {
        previousValue: { reviewCount: prev.reviewCount },
        currentValue: { reviewCount: cur.reviewCount },
        delta: { reviewCount: delta, percentChange: round(pct) },
        // Strength scales with how dramatic the growth is (cap 100).
        strength: clamp(40 + Math.round(pct), 0, 100),
        description: `Reviews grew ${delta > 0 ? '+' : ''}${delta} (${round(pct)}%) since last scan — actively attracting customers`,
      }));
    }
  }

  // ── RATING_CHANGE ──────────────────────────────────────────────────────
  if (isNum(cur.rating) && isNum(prev.rating)) {
    const delta = round(cur.rating - prev.rating);
    if (Math.abs(delta) >= THRESHOLDS.RATING_CHANGE_ABS) {
      const improving = delta > 0;
      signals.push(buildSignal(entity, 'RATING_CHANGE', {
        previousValue: { rating: prev.rating },
        currentValue: { rating: cur.rating },
        delta: { rating: delta },
        strength: improving ? 60 : 70, // a drop is a stronger sales trigger (they need help)
        description: improving
          ? `Rating improved ${delta} stars to ${cur.rating} — reputation momentum`
          : `Rating dropped ${delta} stars to ${cur.rating} — may need reputation help`,
      }));
    }
  }

  // ── WEBSITE_CHANGE (newly detected website) ────────────────────────────
  if (cur.hasWebsite && !prev.hasWebsite) {
    signals.push(buildSignal(entity, 'WEBSITE_CHANGE', {
      previousValue: { hasWebsite: false },
      currentValue: { hasWebsite: true },
      delta: { websiteAdded: true },
      strength: 75,
      description: 'Launched a website — investing in digital presence, prime for digital services',
    }));
  }

  // ── CONTENT_PUBLISHED (new photos uploaded) ────────────────────────────
  if (isNum(cur.imagesCount) && isNum(prev.imagesCount)) {
    const delta = cur.imagesCount - prev.imagesCount;
    if (delta >= 5) {
      signals.push(buildSignal(entity, 'CONTENT_PUBLISHED', {
        previousValue: { imagesCount: prev.imagesCount },
        currentValue: { imagesCount: cur.imagesCount },
        delta: { imagesCount: delta },
        strength: clamp(40 + delta, 0, 90),
        description: `Uploaded ${delta} new photos — actively managing their profile`,
      }));
    }
  }

  // ── SOCIAL_GROWTH ──────────────────────────────────────────────────────
  if (isNum(cur.socialCount) && isNum(prev.socialCount) && prev.socialCount > 0) {
    const pct = ((cur.socialCount - prev.socialCount) / prev.socialCount) * 100;
    if (pct >= THRESHOLDS.SOCIAL_GROWTH_PCT) {
      signals.push(buildSignal(entity, 'SOCIAL_GROWTH', {
        previousValue: { socialCount: prev.socialCount },
        currentValue: { socialCount: cur.socialCount },
        delta: { socialCount: cur.socialCount - prev.socialCount, percentChange: round(pct) },
        strength: clamp(40 + Math.round(pct), 0, 90),
        description: `Social presence grew ${round(pct)}% — expanding marketing footprint`,
      }));
    }
  }

  if (signals.length === 0) return [];

  // Persist all signals. expiresAt = 30 days (timing leverage window).
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const created = await prisma.$transaction(
    signals.map((s) =>
      prisma.signal.create({ data: { ...s, expiresAt } })
    )
  );

  return created;
}

/**
 * Build a Signal create-payload (without expiresAt — added at persist time).
 */
function buildSignal(entity, type, fields) {
  return {
    entityId: entity.id,
    workspaceId: entity.workspaceId,
    type,
    ...fields,
  };
}

// ── helpers ──────────────────────────────────────────────────────────────
function numberOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function isNum(v) {
  return typeof v === 'number' && Number.isFinite(v);
}
function round(n) {
  return Math.round(n * 10) / 10;
}
function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

module.exports = { captureSnapshot, detectSignals, THRESHOLDS };
