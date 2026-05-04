'use strict';

/**
 * GTM Scoring Service
 *
 * Uses Claude API to score each enriched entity against the workspace ICP.
 * Returns a structured object with score (0-100), reasons, fit tier, and
 * recommended outreach angles.
 *
 * Falls back to deterministic heuristic scoring if ANTHROPIC_API_KEY
 * is not configured — so the system works in any environment.
 */

const Anthropic = require('@anthropic-ai/sdk');
const { z } = require('zod');

const SCORE_MODEL = process.env.SCORING_MODEL || 'claude-haiku-4-5';
const SCORE_MAX_TOKENS = 1024;

// Structured output schema — every Claude response is validated against this
const ScoreSchema = z.object({
  score: z.number().int().min(0).max(100),
  fitTier: z.enum(['HIGH', 'MEDIUM', 'LOW']),
  reasons: z.array(z.string().min(5).max(200)).min(1).max(5),
  outreachAngles: z.array(z.string().min(5).max(300)).min(1).max(3),
  scoreBreakdown: z.object({
    fit: z.number().int().min(0).max(100),
    signals: z.number().int().min(0).max(100),
    quality: z.number().int().min(0).max(100),
  }),
});

/** @type {Anthropic.default | null} */
let _anthropic = null;

function getAnthropic() {
  if (_anthropic) return _anthropic;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  _anthropic = new Anthropic.default({ apiKey });
  return _anthropic;
}

/**
 * Score a single GtmEntity against a workspace ICP.
 *
 * @param {object} entity - Full GtmEntity record (with rawData + enrichedData)
 * @param {object} workspace - GtmWorkspace with icpNatural / scoringConfig
 * @returns {Promise<{ score: number, fitTier: string, reasons: string[], outreachAngles: string[], scoreBreakdown: object, provider: string }>}
 */
async function scoreEntity(entity, workspace) {
  const client = getAnthropic();

  if (!client) {
    return heuristicScore(entity, workspace);
  }

  try {
    return await claudeScore(entity, workspace, client);
  } catch (err) {
    // Fail open: if Claude errors out, fall back to heuristic
    return {
      ...heuristicScore(entity, workspace),
      provider: 'heuristic-fallback',
      error: err.message,
    };
  }
}

/**
 * Claude-powered scoring with structured output validation.
 */
async function claudeScore(entity, workspace, client) {
  const startTime = Date.now();

  const systemPrompt = buildSystemPrompt(workspace);
  const userPrompt = buildEntityPrompt(entity);

  const response = await client.messages.create({
    model: SCORE_MODEL,
    max_tokens: SCORE_MAX_TOKENS,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  // Extract text from response
  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock) {
    throw new Error('Claude response did not contain text');
  }

  // Parse JSON — Claude is instructed to return only JSON
  const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Could not extract JSON from Claude response');
  }

  const raw = JSON.parse(jsonMatch[0]);
  const validated = ScoreSchema.parse(raw);

  return {
    ...validated,
    provider: 'claude',
    model: SCORE_MODEL,
    durationMs: Date.now() - startTime,
    inputTokens: response.usage?.input_tokens || 0,
    outputTokens: response.usage?.output_tokens || 0,
  };
}

/**
 * System prompt: give Claude the ICP and scoring framework.
 */
function buildSystemPrompt(workspace) {
  const icpNatural = workspace.icpNatural || 'High-quality businesses with online presence';
  const scoringConfig = workspace.scoringConfig || {};
  const weights = scoringConfig.weights || { fit: 0.4, signals: 0.3, quality: 0.3 };
  const thresholds = scoringConfig.thresholds || { hot: 70, warm: 40 };

  return `You are an expert B2B sales analyst scoring leads against an Ideal Customer Profile (ICP).

# ICP DEFINITION
${icpNatural}

# SCORING FRAMEWORK
Compute three sub-scores (each 0-100), then combine them into a final score:

- **fit** (weight ${weights.fit}): How well the entity matches the ICP definition (industry, size, location, category)
- **signals** (weight ${weights.signals}): Buying signals and growth indicators (review velocity, hiring, funding, tech adoption)
- **quality** (weight ${weights.quality}): Business quality markers (rating, review count, website presence, completeness of contact info)

Weighted final score = fit*${weights.fit} + signals*${weights.signals} + quality*${weights.quality}

# FIT TIERS
- HIGH: score >= ${thresholds.hot}
- MEDIUM: ${thresholds.warm} <= score < ${thresholds.hot}
- LOW: score < ${thresholds.warm}

# RESPONSE FORMAT
Respond with ONLY valid JSON matching this exact schema:
{
  "score": <integer 0-100>,
  "fitTier": "HIGH" | "MEDIUM" | "LOW",
  "reasons": [<1-5 short reasons explaining the score, each under 200 chars>],
  "outreachAngles": [<1-3 specific personalized cold-outreach hooks based on this entity's data, each under 300 chars>],
  "scoreBreakdown": {
    "fit": <integer 0-100>,
    "signals": <integer 0-100>,
    "quality": <integer 0-100>
  }
}

Outreach angles MUST reference specific facts about this entity (their rating, location, category, etc.) — generic pitches are not allowed.`;
}

/**
 * User prompt: the entity data to score.
 */
function buildEntityPrompt(entity) {
  const rawData = entity.rawData || {};
  const enrichedData = entity.enrichedData || {};

  // Build a compact entity summary
  const facts = [
    `Name: ${entity.name}`,
    rawData.categoryName && `Category: ${rawData.categoryName}`,
    (rawData.categories && rawData.categories.length) && `Categories: ${rawData.categories.join(', ')}`,
    rawData.address && `Address: ${rawData.address}`,
    rawData.city && `City: ${rawData.city}`,
    rawData.country && `Country: ${rawData.country}`,
    entity.website && `Website: ${entity.website}`,
    entity.phone && `Phone: ${entity.phone}`,
    entity.email && `Email: ${entity.email}`,
    rawData.totalScore && `Rating: ${rawData.totalScore}/5`,
    rawData.reviewsCount && `Review count: ${rawData.reviewsCount}`,
    rawData.openingHours && `Hours: ${typeof rawData.openingHours === 'string' ? rawData.openingHours : JSON.stringify(rawData.openingHours).slice(0, 200)}`,
    enrichedData.techStack && `Tech stack: ${JSON.stringify(enrichedData.techStack)}`,
    enrichedData.employeeCount && `Employees: ${enrichedData.employeeCount}`,
  ].filter(Boolean).join('\n');

  return `Score this entity:\n\n${facts}\n\nReturn ONLY the JSON response.`;
}

/**
 * Deterministic fallback when Claude isn't available.
 * Scores based on review count, rating, website presence, contact completeness.
 */
function heuristicScore(entity, workspace) {
  const rawData = entity.rawData || {};
  const reasons = [];

  // Quality (40 points)
  let quality = 0;
  if (rawData.totalScore >= 4.5) {
    quality += 20;
    reasons.push(`High rating: ${rawData.totalScore}/5`);
  } else if (rawData.totalScore >= 4.0) {
    quality += 12;
    reasons.push(`Good rating: ${rawData.totalScore}/5`);
  }
  if (rawData.reviewsCount >= 500) {
    quality += 20;
    reasons.push(`Strong review base (${rawData.reviewsCount} reviews) → established business`);
  } else if (rawData.reviewsCount >= 100) {
    quality += 12;
    reasons.push(`Solid review count (${rawData.reviewsCount}) → active customer base`);
  }

  // Fit (30 points)
  let fit = 0;
  if (entity.website) {
    fit += 15;
    reasons.push('Active website → tech-receptive');
  }
  if (entity.phone) fit += 5;
  if (entity.email) fit += 10;

  // Signals (30 points) - default mid since no time-series yet
  let signals = 30;
  if (rawData.categories && rawData.categories.length > 3) {
    signals += 10;
    reasons.push(`Multi-service offering (${rawData.categories.length} categories) → growth orientation`);
  }

  const score = Math.min(100, quality + fit + signals);
  const thresholds = workspace.scoringConfig?.thresholds || { hot: 70, warm: 40 };
  const fitTier = score >= thresholds.hot ? 'HIGH' : score >= thresholds.warm ? 'MEDIUM' : 'LOW';

  // Generic outreach angles based on what we know
  const outreachAngles = [];
  if (rawData.totalScore >= 4.5) {
    outreachAngles.push(`Lead with their ${rawData.totalScore}-star rating — flatter their operational excellence before pitching`);
  }
  if (entity.website && rawData.categoryName) {
    outreachAngles.push(`Reference a specific service from their ${rawData.categoryName} category and ask how they currently handle [your value prop]`);
  }
  if (rawData.city) {
    outreachAngles.push(`Mention you're focused on ${rawData.city}-area ${rawData.categoryName || 'businesses'} and ask for a 15-min intro call`);
  }
  if (outreachAngles.length === 0) {
    outreachAngles.push('Standard cold outreach: introduce, reference category, request a brief call');
  }

  return {
    score,
    fitTier,
    reasons: reasons.length > 0 ? reasons : ['Limited data available for scoring'],
    outreachAngles,
    scoreBreakdown: { fit, signals, quality },
    provider: 'heuristic',
    durationMs: 0,
  };
}

module.exports = { scoreEntity, ScoreSchema };
