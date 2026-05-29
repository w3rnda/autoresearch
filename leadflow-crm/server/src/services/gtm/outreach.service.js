'use strict';

/**
 * Signal-Driven Outreach Generator.
 *
 * Turns detected intent signals into highly-relevant, timing-based outreach
 * copy. This is revenue driver #5: shifting from generic pitches
 * ("Hey, want marketing services?") to signal-driven messaging
 * ("Noticed your reviews grew 60% this quarter — you may be struggling to
 *  keep up with customer response volume...").
 *
 * Uses Claude if ANTHROPIC_API_KEY is set; otherwise falls back to
 * deterministic templates keyed off signal type.
 */

const Anthropic = require('@anthropic-ai/sdk');

const MODEL = process.env.OUTREACH_MODEL || process.env.SCORING_MODEL || 'claude-haiku-4-5';

let _client = null;
function getClient() {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  _client = new Anthropic.default({ apiKey });
  return _client;
}

/**
 * Generate a signal-driven outreach message for an entity.
 *
 * @param {object} entity - GtmEntity
 * @param {Array}  signals - recent Signal records for the entity
 * @param {object} [opts]  - { channel: 'email'|'sms', senderOffer: string }
 * @returns {Promise<{ subject: string|null, body: string, channel: string, provider: string, basedOnSignals: string[] }>}
 */
async function generateOutreach(entity, signals, opts = {}) {
  const channel = opts.channel || 'email';
  const senderOffer = opts.senderOffer || 'marketing and customer-response services';

  const client = getClient();
  if (!client || !signals || signals.length === 0) {
    return templateOutreach(entity, signals, channel, senderOffer);
  }

  try {
    return await claudeOutreach(entity, signals, channel, senderOffer, client);
  } catch (err) {
    return { ...templateOutreach(entity, signals, channel, senderOffer), provider: 'template-fallback', error: err.message };
  }
}

async function claudeOutreach(entity, signals, channel, senderOffer, client) {
  const signalSummary = signals
    .map((s) => `- ${s.type}: ${s.description} (strength ${s.strength})`)
    .join('\n');

  const system = `You are an elite B2B SDR who writes short, signal-driven cold outreach.
Rules:
- Open with the specific growth signal you observed about THEIR business — make it obvious you did your homework.
- Connect that signal to a pain it likely creates, then to how the sender helps.
- Never generic. Never "I hope this email finds you well." No fluff.
- ${channel === 'sms' ? 'SMS: under 320 characters, no subject line.' : 'Email: subject under 60 chars + body under 120 words.'}
- End with a low-friction CTA (a quick 15-min call).
Respond as JSON: ${channel === 'sms' ? '{ "body": "..." }' : '{ "subject": "...", "body": "..." }'}`;

  const user = `Business: ${entity.name}
Category: ${(entity.rawData && entity.rawData.categoryName) || 'business'}
Location: ${(entity.rawData && entity.rawData.city) || 'their area'}
Sender offers: ${senderOffer}

Detected signals:
${signalSummary}

Write the ${channel} now. JSON only.`;

  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 600,
    system,
    messages: [{ role: 'user', content: user }],
  });

  const text = resp.content.find((b) => b.type === 'text')?.text || '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON in outreach response');
  const parsed = JSON.parse(jsonMatch[0]);

  return {
    subject: parsed.subject || null,
    body: parsed.body,
    channel,
    provider: 'claude',
    model: MODEL,
    basedOnSignals: signals.map((s) => s.type),
    inputTokens: resp.usage?.input_tokens || 0,
    outputTokens: resp.usage?.output_tokens || 0,
  };
}

/**
 * Deterministic fallback templates keyed off the strongest signal.
 */
function templateOutreach(entity, signals, channel, senderOffer) {
  const name = entity.name;
  const city = (entity.rawData && entity.rawData.city) || 'your area';
  const top = (signals && signals.length > 0)
    ? [...signals].sort((a, b) => (b.strength || 0) - (a.strength || 0))[0]
    : null;

  let hook;
  switch (top?.type) {
    case 'REVIEW_GROWTH':
      hook = `I noticed ${name}'s reviews jumped recently — that kind of growth usually means you're fielding a lot more customer messages than before.`;
      break;
    case 'RATING_CHANGE':
      hook = top.delta?.rating > 0
        ? `Saw ${name}'s rating climbing — clearly you're doing something right, and now's the time to capitalize on that momentum.`
        : `Noticed ${name}'s rating dipped a little recently — a few small changes can turn that around fast.`;
      break;
    case 'WEBSITE_CHANGE':
      hook = `Saw ${name} just launched a website — great timing to make sure it's actually pulling in customers.`;
      break;
    case 'CONTENT_PUBLISHED':
      hook = `Noticed ${name} has been actively posting new photos — you clearly care about how the business shows up online.`;
      break;
    case 'SOCIAL_GROWTH':
      hook = `Saw ${name}'s social presence expanding — momentum like that is worth amplifying.`;
      break;
    default:
      hook = `I've been following businesses like ${name} in ${city} and wanted to reach out.`;
  }

  const body = `${hook}\n\nWe help ${city} businesses with ${senderOffer} — turning that growth into booked revenue without adding to your workload. Worth a quick 15-minute call this week?`;

  return {
    subject: top ? signalSubject(top, name) : `Quick idea for ${name}`,
    body: channel === 'sms' ? body.replace(/\n+/g, ' ').slice(0, 315) : body,
    channel,
    provider: 'template',
    basedOnSignals: signals ? signals.map((s) => s.type) : [],
  };
}

function signalSubject(signal, name) {
  switch (signal.type) {
    case 'REVIEW_GROWTH': return `${name} — keeping up with all those new reviews?`;
    case 'RATING_CHANGE': return signal.delta?.rating > 0 ? `${name}'s momentum` : `A quick win for ${name}`;
    case 'WEBSITE_CHANGE': return `Your new site + more customers`;
    case 'CONTENT_PUBLISHED': return `Noticed your new posts, ${name}`;
    case 'SOCIAL_GROWTH': return `${name}'s growing audience`;
    default: return `Quick idea for ${name}`;
  }
}

module.exports = { generateOutreach };
