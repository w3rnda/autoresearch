'use strict';

const { v4: uuidv4 } = require('uuid');

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001';

/**
 * Creates a Nodemailer transporter using SMTP env vars.
 * Called lazily so the module loads without nodemailer when SMTP is not configured.
 *
 * @returns {import('nodemailer').Transporter}
 */
function createTransporter() {
  const nodemailer = require('nodemailer');
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: parseInt(process.env.SMTP_PORT || '587', 10) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

/**
 * Sends an email. Uses Nodemailer when SMTP_HOST is configured; otherwise
 * falls back to a console-log mock that simulates delivery.
 *
 * @param {{ to: string, subject: string, html?: string, text?: string }} options
 * @returns {Promise<{ messageId: string, sent: boolean, timestamp: string }>}
 */
async function sendEmail({ to, subject, html, text }) {
  const timestamp = new Date().toISOString();

  if (process.env.SMTP_HOST) {
    const transporter = createTransporter();
    const from = process.env.SMTP_FROM || 'noreply@leadflow.app';

    const info = await transporter.sendMail({
      from,
      to,
      subject,
      ...(text && { text }),
      ...(html && { html }),
    });

    return {
      messageId: info.messageId,
      sent: true,
      timestamp,
    };
  }

  // Console-log mock fallback
  const messageId = uuidv4();

  console.log('--- [Email Mock] Sending email ---');
  console.log(`  messageId : ${messageId}`);
  console.log(`  to        : ${to}`);
  console.log(`  subject   : ${subject}`);
  console.log(`  timestamp : ${timestamp}`);
  if (text) {
    console.log(`  text      : ${text.slice(0, 200)}${text.length > 200 ? '...' : ''}`);
  }
  if (html) {
    const stripped = html.replace(/<[^>]*>/g, '');
    console.log(`  html      : ${stripped.slice(0, 200)}${stripped.length > 200 ? '...' : ''}`);
  }
  console.log('---------------------------------');

  return {
    messageId,
    sent: true,
    timestamp,
  };
}

/**
 * Returns the URL of the 1x1 transparent tracking pixel for the given email
 * event ID. When the recipient's email client loads this image the server will
 * record an OPEN event.
 *
 * @param {string} eventId - Unique identifier for the tracking event.
 * @returns {string} Absolute URL
 */
function generateTrackingPixelUrl(eventId) {
  return `${BASE_URL}/api/v1/track/open/${encodeURIComponent(eventId)}`;
}

/**
 * Returns a redirect URL that records a CLICK event for `eventId` and then
 * sends the browser to `originalUrl`.
 *
 * @param {string} eventId - Unique identifier for the tracking event.
 * @param {string} originalUrl - The destination URL after tracking.
 * @returns {string} Absolute URL
 */
function generateClickTrackingUrl(eventId, originalUrl) {
  const encoded = encodeURIComponent(originalUrl);
  return `${BASE_URL}/api/v1/track/click/${encodeURIComponent(eventId)}?redirect=${encoded}`;
}

/**
 * Injects open-tracking and click-tracking into a raw HTML email body.
 * - Replaces every `<a href="...">` with a click-tracked redirect URL.
 * - Appends a 1x1 transparent tracking pixel `<img>` before the closing
 *   `</body>` tag (or at the end of the string if no </body> is present).
 *
 * @param {string} html      - The original HTML email content.
 * @param {string} leadId    - The lead this email is being sent to.
 * @param {string} stepId    - The sequence step (or message) ID.
 * @returns {string} Modified HTML with tracking injected.
 */
function injectTracking(html, leadId, stepId) {
  const openEventId = `open_${leadId}_${stepId}`;

  // Replace all anchor hrefs with click-tracking URLs
  const trackedHtml = html.replace(
    /<a\s+([^>]*?)href="([^"]+)"([^>]*?)>/gi,
    (match, before, href, after) => {
      // Do not re-wrap already-wrapped tracking URLs
      if (href.includes('/api/v1/track/')) {
        return match;
      }
      const clickEventId = `click_${leadId}_${stepId}_${uuidv4()}`;
      const trackedHref = generateClickTrackingUrl(clickEventId, href);
      return `<a ${before}href="${trackedHref}"${after}>`;
    }
  );

  // Build tracking pixel HTML
  const pixelUrl = generateTrackingPixelUrl(openEventId);
  const pixelHtml = `<img src="${pixelUrl}" width="1" height="1" alt="" style="display:none;" />`;

  // Inject pixel before </body> if present, otherwise append to end
  if (/<\/body>/i.test(trackedHtml)) {
    return trackedHtml.replace(/<\/body>/i, `${pixelHtml}</body>`);
  }

  return trackedHtml + pixelHtml;
}

module.exports = {
  sendEmail,
  generateTrackingPixelUrl,
  generateClickTrackingUrl,
  injectTracking,
};
