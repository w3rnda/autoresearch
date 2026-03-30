'use strict';

const prisma = require('../prisma');
const { successResponse } = require('../utils/response.utils');

const getStats = async (req, res, next) => {
  try {
    const { organizationId } = req.user;
    const now = new Date();
    const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      totalLeads,
      hotLeads,
      customerLeads,
      coldLeads,
      warmLeads,
      totalEvents,
      openEvents,
      pipelineDeals,
      upcomingMeetings,
      recentLeads,
      topLeads,
      activeSequences,
      emailsSent7d,
      activeDeals,
    ] = await Promise.all([
      prisma.lead.count({ where: { organizationId } }),
      prisma.lead.count({ where: { organizationId, status: 'HOT' } }),
      prisma.lead.count({ where: { organizationId, status: 'CUSTOMER' } }),
      prisma.lead.count({ where: { organizationId, status: 'COLD' } }),
      prisma.lead.count({ where: { organizationId, status: 'WARM' } }),
      prisma.emailEvent.count({ where: { lead: { organizationId }, type: 'SENT' } }),
      prisma.emailEvent.count({ where: { lead: { organizationId }, type: 'OPEN' } }),
      prisma.pipelineDeal.findMany({
        where: { lead: { organizationId } },
        select: { value: true, stage: true },
      }),
      prisma.meeting.count({
        where: { lead: { organizationId }, scheduledAt: { gte: now, lte: weekFromNow } },
      }),
      // Recent leads
      prisma.lead.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          company: true,
          status: true,
          score: true,
          createdAt: true,
        },
      }),
      // Top leads by composite score
      prisma.lead.findMany({
        where: { organizationId },
        orderBy: { score: 'desc' },
        take: 5,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          company: true,
          score: true,
          engagementScore: true,
          fitScore: true,
        },
      }),
      // Active sequence enrollments
      prisma.sequenceEnrollment.count({
        where: { status: 'ACTIVE', lead: { organizationId } },
      }),
      // Emails sent in last 7 days
      prisma.emailEvent.count({
        where: {
          lead: { organizationId },
          type: 'SENT',
          createdAt: { gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) },
        },
      }),
      // Active (non-closed) deals
      prisma.pipelineDeal.count({
        where: {
          lead: { organizationId },
          stage: { notIn: ['CLOSED_WON', 'CLOSED_LOST'] },
        },
      }),
    ]);

    // Weekly leads over time — last 8 weeks using raw aggregation
    const leadsOverTime = await buildLeadsOverTime(organizationId, 8);

    const pipelineValue = pipelineDeals
      .filter(d => d.stage !== 'CLOSED_LOST')
      .reduce((s, d) => s + d.value, 0);

    const conversionRate = totalLeads > 0 ? Math.round((customerLeads / totalLeads) * 100) : 0;
    const emailOpenRate = totalEvents > 0 ? Math.round((openEvents / totalEvents) * 100) : 0;

    const stageBreakdown = {};
    for (const deal of pipelineDeals) {
      stageBreakdown[deal.stage] = (stageBreakdown[deal.stage] || 0) + 1;
    }

    // Funnel data for the dashboard chart
    const FUNNEL_STAGES = ['NEW', 'ENGAGED', 'PROPOSAL_SENT', 'CLOSED_WON', 'CLOSED_LOST'];
    const FUNNEL_COLORS = {
      NEW: '#6366f1',
      ENGAGED: '#8b5cf6',
      PROPOSAL_SENT: '#a78bfa',
      CLOSED_WON: '#10b981',
      CLOSED_LOST: '#f43f5e',
    };
    const funnelData = FUNNEL_STAGES.map(stage => ({
      stage,
      value: stageBreakdown[stage] || 0,
      fill: FUNNEL_COLORS[stage],
    }));

    return res.json(successResponse({
      totalLeads,
      hotLeads,
      customerLeads,
      conversionRate,
      emailOpenRate,
      pipelineValue,
      upcomingMeetings,
      stageBreakdown,
      statusBreakdown: {
        cold: coldLeads,
        warm: warmLeads,
        hot: hotLeads,
        customer: customerLeads,
      },
      recentLeads,
      topLeads,
      funnelData,
      leadsOverTime,
      activeSequences,
      emailsSent7d,
      activeDeals,
    }));
  } catch (err) {
    next(err);
  }
};

/**
 * Build an 8-week time series of leads created per week.
 * Uses Prisma's standard query (no raw SQL) for cross-DB compatibility.
 *
 * @param {string} organizationId
 * @param {number} weeks
 * @returns {Promise<Array<{week: string, leads: number}>>}
 */
async function buildLeadsOverTime(organizationId, weeks) {
  const buckets = [];
  const now = new Date();

  // Build week bucket boundaries from oldest to newest
  for (let i = weeks - 1; i >= 0; i--) {
    const end = new Date(now.getTime() - i * 7 * 24 * 60 * 60 * 1000);
    const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
    // Label as "Mar 10", "Mar 17", etc.
    const label = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    buckets.push({ start, end, label, leads: 0 });
  }

  // Fetch all leads created in the window
  const since = buckets[0].start;
  const leads = await prisma.lead.findMany({
    where: { organizationId, createdAt: { gte: since } },
    select: { createdAt: true },
  });

  // Bucket each lead
  for (const lead of leads) {
    for (const bucket of buckets) {
      if (lead.createdAt >= bucket.start && lead.createdAt < bucket.end) {
        bucket.leads++;
        break;
      }
    }
  }

  return buckets.map(({ label, leads }) => ({ week: label, leads }));
}

module.exports = { getStats };
