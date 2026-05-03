'use strict';

const prisma = require('../prisma');
const { successResponse } = require('../utils/response.utils');

const PIPELINE_STAGES = ['NEW', 'ENGAGED', 'PROPOSAL_SENT', 'CLOSED_WON', 'CLOSED_LOST'];
const ACTIVE_STAGES = ['NEW', 'ENGAGED', 'PROPOSAL_SENT'];

/**
 * GET /analytics/funnel
 * Returns deal counts per stage and conversion rate between consecutive stages.
 * Query params: days (default 30) — look-back window for transitions.
 */
const getFunnel = async (req, res, next) => {
  try {
    const { organizationId } = req.user;
    const days = parseInt(req.query.days, 10) || 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Current live deal count per stage
    const dealCounts = await prisma.pipelineDeal.groupBy({
      by: ['stage'],
      where: { lead: { organizationId } },
      _count: { id: true },
    });

    const countByStage = {};
    for (const row of dealCounts) {
      countByStage[row.stage] = row._count.id;
    }

    // Transition counts for conversion rates: how many deals moved INTO each stage in window
    const transitions = await prisma.stageTransition.groupBy({
      by: ['toStage'],
      where: {
        createdAt: { gte: since },
        deal: { lead: { organizationId } },
      },
      _count: { id: true },
    });

    const transitionInto = {};
    for (const t of transitions) {
      transitionInto[t.toStage] = t._count.id;
    }

    // Build funnel array
    const funnel = PIPELINE_STAGES.map((stage, idx) => {
      const count = countByStage[stage] || 0;
      const entered = transitionInto[stage] || 0;
      const prevEntered = idx > 0 ? (transitionInto[PIPELINE_STAGES[idx - 1]] || 0) : null;
      const conversionRate = prevEntered && prevEntered > 0
        ? Math.round((entered / prevEntered) * 100)
        : null;

      return { stage, count, entered, conversionRate };
    });

    // Total value per stage
    const dealValues = await prisma.pipelineDeal.groupBy({
      by: ['stage'],
      where: { lead: { organizationId } },
      _sum: { value: true },
    });

    const valueByStage = {};
    for (const row of dealValues) {
      valueByStage[row.stage] = row._sum.value || 0;
    }

    const funnelWithValue = funnel.map(f => ({
      ...f,
      totalValue: valueByStage[f.stage] || 0,
    }));

    return res.json(successResponse({ funnel: funnelWithValue, days }));
  } catch (error) {
    next(error);
  }
};

/**
 * GET /analytics/velocity
 * Returns average days a deal spends in each stage before moving to the next.
 * Query params: days (default 90)
 */
const getVelocity = async (req, res, next) => {
  try {
    const { organizationId } = req.user;
    const days = parseInt(req.query.days, 10) || 90;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Fetch all transitions in window for this org
    const transitions = await prisma.stageTransition.findMany({
      where: {
        createdAt: { gte: since },
        deal: { lead: { organizationId } },
        fromStage: { not: null },
      },
      select: { dealId: true, fromStage: true, toStage: true, createdAt: true },
      orderBy: [{ dealId: 'asc' }, { createdAt: 'asc' }],
    });

    // For each transition, compute time spent in fromStage:
    // pair consecutive transitions on the same deal
    const dealTransitions = {};
    for (const t of transitions) {
      if (!dealTransitions[t.dealId]) dealTransitions[t.dealId] = [];
      dealTransitions[t.dealId].push(t);
    }

    // stageTime[stage] = array of durations in days
    const stageTimes = {};
    for (const dealId of Object.keys(dealTransitions)) {
      const ts = dealTransitions[dealId];
      for (let i = 1; i < ts.length; i++) {
        const prev = ts[i - 1];
        const curr = ts[i];
        const daysInStage = (curr.createdAt - prev.createdAt) / (1000 * 60 * 60 * 24);
        if (!stageTimes[prev.toStage]) stageTimes[prev.toStage] = [];
        stageTimes[prev.toStage].push(daysInStage);
      }
    }

    // Calculate avg and median per stage
    function median(arr) {
      if (!arr.length) return 0;
      const sorted = [...arr].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 !== 0
        ? sorted[mid]
        : (sorted[mid - 1] + sorted[mid]) / 2;
    }

    const velocity = ACTIVE_STAGES.map(stage => {
      const times = stageTimes[stage] || [];
      const avg = times.length > 0
        ? Math.round((times.reduce((s, v) => s + v, 0) / times.length) * 10) / 10
        : null;
      const med = times.length > 0 ? Math.round(median(times) * 10) / 10 : null;
      return { stage, avgDays: avg, medianDays: med, sampleSize: times.length };
    });

    return res.json(successResponse({ velocity, days }));
  } catch (error) {
    next(error);
  }
};

/**
 * GET /analytics/aging
 * Returns deals that haven't moved stage in > threshold days.
 * Query params: threshold (default 14), limit (default 20)
 */
const getAging = async (req, res, next) => {
  try {
    const { organizationId } = req.user;
    const threshold = parseInt(req.query.threshold, 10) || 14;
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const cutoff = new Date(Date.now() - threshold * 24 * 60 * 60 * 1000);

    // Find active deals whose most recent stage transition is before the cutoff
    const activeDeals = await prisma.pipelineDeal.findMany({
      where: {
        lead: { organizationId },
        stage: { notIn: ['CLOSED_WON', 'CLOSED_LOST'] },
      },
      include: {
        lead: { select: { id: true, firstName: true, lastName: true, company: true } },
        transitions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { updatedAt: 'asc' },
    });

    const staleDeals = [];
    for (const deal of activeDeals) {
      const lastActivity = deal.transitions.length > 0
        ? deal.transitions[0].createdAt
        : deal.createdAt;

      const daysStale = Math.floor((Date.now() - lastActivity.getTime()) / (1000 * 60 * 60 * 24));
      if (daysStale >= threshold) {
        staleDeals.push({
          dealId: deal.id,
          stage: deal.stage,
          value: deal.value,
          daysStale,
          lead: deal.lead,
          lastActivity,
        });
      }
    }

    // Sort by most stale first, apply limit
    staleDeals.sort((a, b) => b.daysStale - a.daysStale);
    const paged = staleDeals.slice(0, limit);

    // Stage-level summary
    const stageSummary = {};
    for (const d of staleDeals) {
      if (!stageSummary[d.stage]) stageSummary[d.stage] = { count: 0, avgDaysStale: 0, total: 0 };
      stageSummary[d.stage].count++;
      stageSummary[d.stage].total += d.daysStale;
    }
    for (const s of Object.keys(stageSummary)) {
      stageSummary[s].avgDaysStale = Math.round(stageSummary[s].total / stageSummary[s].count);
    }

    return res.json(successResponse({
      staleDeals: paged,
      stageSummary,
      total: staleDeals.length,
      threshold,
    }));
  } catch (error) {
    next(error);
  }
};

/**
 * GET /analytics/overview
 * Summary metrics: win rate, avg deal size, total pipeline value, avg cycle time.
 * Query params: days (default 30)
 */
const getOverview = async (req, res, next) => {
  try {
    const { organizationId } = req.user;
    const days = parseInt(req.query.days, 10) || 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [closedWon, closedLost, allDeals, newLeads, activeSequences] = await Promise.all([
      prisma.pipelineDeal.count({
        where: { stage: 'CLOSED_WON', createdAt: { gte: since }, lead: { organizationId } },
      }),
      prisma.pipelineDeal.count({
        where: { stage: 'CLOSED_LOST', createdAt: { gte: since }, lead: { organizationId } },
      }),
      prisma.pipelineDeal.findMany({
        where: { lead: { organizationId }, stage: { notIn: ['CLOSED_LOST'] } },
        select: { value: true, stage: true },
      }),
      prisma.lead.count({
        where: { organizationId, createdAt: { gte: since } },
      }),
      prisma.sequenceEnrollment.count({
        where: { status: 'ACTIVE', lead: { organizationId } },
      }),
    ]);

    const totalClosed = closedWon + closedLost;
    const winRate = totalClosed > 0 ? Math.round((closedWon / totalClosed) * 100) : 0;
    const activePipelineValue = allDeals.filter(d => d.stage !== 'CLOSED_WON')
      .reduce((s, d) => s + d.value, 0);
    const wonValue = allDeals.filter(d => d.stage === 'CLOSED_WON')
      .reduce((s, d) => s + d.value, 0);
    const avgDealSize = allDeals.length > 0
      ? Math.round(allDeals.reduce((s, d) => s + d.value, 0) / allDeals.length)
      : 0;

    return res.json(successResponse({
      winRate,
      closedWon,
      closedLost,
      newLeads,
      activePipelineValue,
      wonValue,
      avgDealSize,
      activeSequences,
      days,
    }));
  } catch (error) {
    next(error);
  }
};

module.exports = { getFunnel, getVelocity, getAging, getOverview };
