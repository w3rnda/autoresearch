'use strict';

const prisma = require('../prisma');
const { recomputeAndPersist } = require('../services/scoring.service');

// 1x1 transparent GIF
const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

// GET /track/open/:eventId
const trackOpen = async (req, res) => {
  // Always respond immediately — scoring is fire-and-forget
  res.setHeader('Content-Type', 'image/gif');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.send(PIXEL);

  // Async scoring — runs after response is sent
  setImmediate(async () => {
    try {
      const { eventId } = req.params;
      let leadId;
      try { leadId = Buffer.from(eventId, 'base64').toString('utf8'); } catch { leadId = eventId; }

      const lead = await prisma.lead.findUnique({ where: { id: leadId } });
      if (!lead) return;

      await prisma.emailEvent.create({
        data: { leadId, type: 'OPEN', metadata: { ip: req.ip, ua: req.headers['user-agent'] } },
      });

      // Recompute composite score using centralized service
      await recomputeAndPersist(leadId);
    } catch (err) {
      // Silently ignore tracking errors — must not affect response
    }
  });
};

// GET /track/click/:eventId?url=<encoded>
const trackClick = async (req, res) => {
  const { eventId } = req.params;
  const redirectUrl = req.query.url ? decodeURIComponent(req.query.url) : 'https://leadflow.app';

  // Redirect immediately
  res.redirect(302, redirectUrl);

  // Async scoring — runs after redirect
  setImmediate(async () => {
    try {
      let leadId;
      try { leadId = Buffer.from(eventId, 'base64').toString('utf8'); } catch { leadId = eventId; }

      const lead = await prisma.lead.findUnique({ where: { id: leadId } });
      if (!lead) return;

      await prisma.emailEvent.create({
        data: { leadId, type: 'CLICK', metadata: { url: redirectUrl, ip: req.ip } },
      });

      // Recompute composite score using centralized service
      await recomputeAndPersist(leadId);
    } catch (err) {
      // Silently ignore tracking errors
    }
  });
};

module.exports = { trackOpen, trackClick };
