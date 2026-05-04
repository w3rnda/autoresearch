'use strict';

/**
 * Hunter.io Email Finder Provider
 *
 * Finds professional email addresses associated with a domain.
 * Falls back to common-pattern guessing if HUNTER_API_KEY is not configured.
 *
 * API: https://hunter.io/api-documentation/v2
 */

const HUNTER_BASE_URL = 'https://api.hunter.io/v2';

/**
 * Find emails for a domain. Returns top decision-maker emails.
 *
 * @param {string} domain - Company domain (e.g. 'example.com')
 * @returns {Promise<{ emails: Array<{ value: string, type: string, confidence: number, position?: string, firstName?: string, lastName?: string }>, provider: string, creditCost: number }>}
 */
async function findEmailsForDomain(domain) {
  if (!domain) {
    return { emails: [], provider: 'none', creditCost: 0 };
  }

  const apiKey = process.env.HUNTER_API_KEY;

  if (!apiKey) {
    return guessEmailPattern(domain);
  }

  try {
    return await hunterDomainSearch(domain, apiKey);
  } catch (err) {
    return {
      ...guessEmailPattern(domain),
      provider: 'hunter-fallback',
      error: err.message,
    };
  }
}

/**
 * Real Hunter.io domain search.
 */
async function hunterDomainSearch(domain, apiKey) {
  const startTime = Date.now();
  const url = `${HUNTER_BASE_URL}/domain-search?domain=${encodeURIComponent(domain)}&limit=10&api_key=${apiKey}`;

  const response = await fetch(url);

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Hunter.io API error: ${response.status} - ${errorBody}`);
  }

  const data = await response.json();
  const rawEmails = data.data?.emails || [];

  // Sort by seniority signals: prefer founder/exec → director → manager → other
  const SENIORITY_PRIORITY = {
    executive: 100,
    director: 80,
    manager: 60,
    'mid-level': 40,
    'entry-level': 20,
  };

  const emails = rawEmails
    .map((e) => ({
      value: e.value,
      type: e.type,
      confidence: e.confidence || 0,
      position: e.position || null,
      firstName: e.first_name || null,
      lastName: e.last_name || null,
      seniority: e.seniority || null,
      department: e.department || null,
      sources: (e.sources || []).slice(0, 3).map((s) => s.uri),
    }))
    .sort((a, b) => {
      const aSen = SENIORITY_PRIORITY[a.seniority] || 0;
      const bSen = SENIORITY_PRIORITY[b.seniority] || 0;
      if (aSen !== bSen) return bSen - aSen;
      return (b.confidence || 0) - (a.confidence || 0);
    });

  return {
    emails,
    pattern: data.data?.pattern || null,
    organizationName: data.data?.organization || null,
    provider: 'hunter',
    durationMs: Date.now() - startTime,
    creditCost: 1, // 1 Hunter credit per request
  };
}

/**
 * Email Verifier — verify deliverability of a single email.
 */
async function verifyEmail(email) {
  const apiKey = process.env.HUNTER_API_KEY;
  if (!apiKey) {
    return { email, status: 'unknown', confidence: 0, provider: 'none' };
  }

  try {
    const url = `${HUNTER_BASE_URL}/email-verifier?email=${encodeURIComponent(email)}&api_key=${apiKey}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Hunter verifier error: ${response.status}`);
    }

    const data = await response.json();
    return {
      email,
      status: data.data?.status || 'unknown', // valid / invalid / accept_all / unknown / disposable / webmail
      confidence: data.data?.score || 0,
      mxRecords: data.data?.mx_records || false,
      smtpServer: data.data?.smtp_server || false,
      smtpCheck: data.data?.smtp_check || false,
      acceptAll: data.data?.accept_all || false,
      disposable: data.data?.disposable || false,
      provider: 'hunter',
    };
  } catch (err) {
    return { email, status: 'error', error: err.message, provider: 'hunter' };
  }
}

/**
 * Pattern-guessing fallback when Hunter isn't available.
 * Generates the most-common professional email patterns for a domain.
 */
function guessEmailPattern(domain) {
  // Strip www. prefix and common subdomains
  const cleanDomain = domain.replace(/^(www\.|mail\.)/i, '');

  return {
    emails: [
      { value: `info@${cleanDomain}`, type: 'generic', confidence: 50, position: 'General Inquiries' },
      { value: `contact@${cleanDomain}`, type: 'generic', confidence: 40, position: 'General Inquiries' },
      { value: `hello@${cleanDomain}`, type: 'generic', confidence: 30, position: 'General Inquiries' },
      { value: `sales@${cleanDomain}`, type: 'generic', confidence: 30, position: 'Sales' },
    ],
    pattern: 'unknown',
    provider: 'pattern-guess',
    durationMs: 0,
    creditCost: 0,
  };
}

module.exports = { findEmailsForDomain, verifyEmail };
