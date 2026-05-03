'use strict';

const prisma = require('../prisma');

/** Sources that boost fit score */
const HIGH_FIT_SOURCES = new Set(['REFERRAL', 'WEBSITE', 'EVENT']);

/** ICP industry tags that add fit score */
const ICP_INDUSTRIES = new Set([
  'SaaS', 'FinTech', 'HealthTech', 'E-commerce', 'EdTech',
  'Manufacturing', 'Logistics', 'Consulting',
]);

/** Company size tags considered ideal */
const IDEAL_SIZES = new Set(['11-50', '51-200', '201-500']);

/**
 * Recomputes the engagementScore for a lead based on all their EmailEvents.
 * Engagement points: OPEN +10, CLICK +20 (each event counts, capped at 100).
 * Does NOT persist — returns the computed value.
 *
 * @param {string} leadId
 * @returns {Promise<number>}
 */
async function computeEngagementScore(leadId) {
  const events = await prisma.emailEvent.findMany({
    where: { leadId, type: { in: ['OPEN', 'CLICK'] } },
    select: { type: true },
  });

  let points = 0;
  for (const evt of events) {
    if (evt.type === 'OPEN') points += 10;
    else if (evt.type === 'CLICK') points += 20;
  }

  // Meetings booked for this lead add +50 each (cap total at 100)
  const meetingCount = await prisma.meeting.count({ where: { leadId } });
  points += meetingCount * 50;

  return Math.min(100, points);
}

/**
 * Computes a fit score for a lead based on demographic / firmographic signals.
 * Fit points: company present +10, phone present +5, ICP industry tag +15,
 * ideal company size tag +10, high-fit source +10. Capped at 100.
 * Does NOT persist — returns the computed value.
 *
 * @param {{ source: string, company: string|null, phone: string|null, tags: string[] }} lead
 * @returns {number}
 */
function computeFitScore(lead) {
  let points = 0;

  if (lead.company) points += 10;
  if (lead.phone) points += 5;
  if (HIGH_FIT_SOURCES.has(lead.source)) points += 10;

  for (const tag of (lead.tags || [])) {
    if (ICP_INDUSTRIES.has(tag)) { points += 15; break; }
  }
  for (const tag of (lead.tags || [])) {
    if (IDEAL_SIZES.has(tag)) { points += 10; break; }
  }

  return Math.min(100, points);
}

/**
 * Determines lead status based on composite score.
 * Never downgrades a CUSTOMER back to a lower status.
 *
 * @param {number} compositeScore
 * @param {string} currentStatus
 * @returns {string}
 */
function deriveStatus(compositeScore, currentStatus) {
  if (currentStatus === 'CUSTOMER') return 'CUSTOMER';
  if (compositeScore >= 60) return 'HOT';
  if (compositeScore >= 30) return 'WARM';
  return 'COLD';
}

/**
 * Recomputes both scores and the composite for a lead, then persists.
 * Composite = 0.6 * engagementScore + 0.4 * fitScore, rounded, capped at 100.
 *
 * @param {string} leadId
 * @returns {Promise<{ engagementScore: number, fitScore: number, score: number, status: string }>}
 */
async function recomputeAndPersist(leadId) {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { source: true, company: true, phone: true, tags: true, status: true },
  });

  if (!lead) return null;

  const engagementScore = await computeEngagementScore(leadId);
  const fitScore = computeFitScore(lead);
  const composite = Math.min(100, Math.round(0.6 * engagementScore + 0.4 * fitScore));
  const newStatus = deriveStatus(composite, lead.status);

  await prisma.lead.update({
    where: { id: leadId },
    data: { engagementScore, fitScore, score: composite, status: newStatus },
  });

  return { engagementScore, fitScore, score: composite, status: newStatus };
}

module.exports = { computeEngagementScore, computeFitScore, deriveStatus, recomputeAndPersist };
