const prisma = require('../prisma');
const { successResponse, errorResponse } = require('../utils/response.utils');
const { PIPELINE_TEMPLATES } = require('./pipelines.controller');

/**
 * Ensures the org has at least one pipeline.
 * If none exist, auto-creates the default Standard Sales pipeline.
 */
async function ensureDefaultPipeline(organizationId) {
  let pipeline = await prisma.pipeline.findFirst({
    where: { organizationId },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
  });

  if (!pipeline) {
    pipeline = await prisma.pipeline.create({
      data: {
        name: 'Sales Pipeline',
        description: PIPELINE_TEMPLATES.STANDARD.description,
        type: 'STANDARD',
        stages: PIPELINE_TEMPLATES.STANDARD.stages,
        organizationId,
        isDefault: true,
      },
    });
  }

  return pipeline;
}

/**
 * GET /pipeline?pipelineId=xxx&source=WEBSITE
 * Returns all deals grouped by the pipeline's stages.
 * If no pipelineId is given, uses the org's default pipeline.
 */
const getDeals = async (req, res, next) => {
  try {
    const { organizationId } = req.user;
    const { pipelineId, source } = req.query;

    // Resolve pipeline
    let pipeline;
    if (pipelineId) {
      pipeline = await prisma.pipeline.findFirst({ where: { id: pipelineId, organizationId } });
      if (!pipeline) {
        return res.status(404).json(errorResponse('Pipeline not found'));
      }
    } else {
      pipeline = await ensureDefaultPipeline(organizationId);
    }

    const stages = Array.isArray(pipeline.stages) ? pipeline.stages : [];

    // Build deal query
    const leadFilter = { organizationId };
    if (source) leadFilter.source = source;

    const deals = await prisma.pipelineDeal.findMany({
      where: {
        pipelineId: pipeline.id,
        lead: leadFilter,
      },
      include: {
        lead: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            company: true,
            status: true,
            score: true,
            source: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Build stage map from pipeline config
    const stageMap = {};
    for (const s of stages) {
      stageMap[s.key] = {
        ...s,
        deals: [],
        count: 0,
        totalValue: 0,
        weightedValue: 0,
      };
    }

    // Bin deals into their stage bucket
    for (const deal of deals) {
      const bucket = stageMap[deal.stage];
      if (bucket) {
        bucket.deals.push(deal);
        bucket.count += 1;
        bucket.totalValue += deal.value || 0;
        bucket.weightedValue += (deal.value || 0) * ((deal.probability || 0) / 100);
      }
    }

    return res.status(200).json(successResponse({ pipeline, stages: stageMap }));
  } catch (error) {
    next(error);
  }
};

/**
 * POST /pipeline
 * Creates a deal inside the specified (or default) pipeline.
 * Body: { leadId, stage?, value?, probability?, pipelineId? }
 */
const createDeal = async (req, res, next) => {
  try {
    const { leadId, stage, value, probability, pipelineId: reqPipelineId } = req.body;
    const { organizationId, id: userId } = req.user;

    // Verify lead belongs to org
    const lead = await prisma.lead.findFirst({ where: { id: leadId, organizationId } });
    if (!lead) {
      return res.status(404).json(errorResponse('Lead not found'));
    }

    // Resolve pipeline
    let pipeline;
    if (reqPipelineId) {
      pipeline = await prisma.pipeline.findFirst({ where: { id: reqPipelineId, organizationId } });
      if (!pipeline) {
        return res.status(404).json(errorResponse('Pipeline not found'));
      }
    } else {
      pipeline = await ensureDefaultPipeline(organizationId);
    }

    const pipelineStages = Array.isArray(pipeline.stages) ? pipeline.stages : [];
    const sortedStages = [...pipelineStages].sort((a, b) => a.order - b.order);
    const firstStageKey = sortedStages[0]?.key || 'NEW';
    const initialStage = stage || firstStageKey;

    // Validate stage against this pipeline
    const validKeys = pipelineStages.map((s) => s.key);
    if (!validKeys.includes(initialStage)) {
      return res.status(400).json(
        errorResponse(`Invalid stage "${initialStage}". Valid stages: ${validKeys.join(', ')}`)
      );
    }

    const deal = await prisma.pipelineDeal.create({
      data: {
        leadId,
        pipelineId: pipeline.id,
        stage: initialStage,
        value: value || 0,
        probability: probability !== undefined ? probability : 10,
      },
      include: {
        lead: { select: { id: true, firstName: true, lastName: true, email: true, company: true } },
      },
    });

    // Record initial stage transition
    await prisma.stageTransition.create({
      data: { dealId: deal.id, fromStage: null, toStage: initialStage },
    });

    // Notify the creating user
    await prisma.notification.create({
      data: {
        userId,
        message: `New deal created for ${lead.firstName} ${lead.lastName}${lead.company ? ` at ${lead.company}` : ''}`,
        type: 'SUCCESS',
        read: false,
      },
    });

    return res.status(201).json(successResponse(deal, 'Deal created'));
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /pipeline/:id
 * Updates stage, value, or probability.
 * Stage is validated against the deal's pipeline stages.
 */
const updateDeal = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { organizationId } = req.user;
    const { stage, value, probability } = req.body;

    // Verify deal belongs to org
    const existing = await prisma.pipelineDeal.findFirst({
      where: { id, lead: { organizationId } },
      include: { pipeline: true },
    });
    if (!existing) {
      return res.status(404).json(errorResponse('Deal not found'));
    }

    // Validate stage if provided
    if (stage !== undefined) {
      const pipeline = existing.pipeline;
      if (pipeline) {
        const validKeys = Array.isArray(pipeline.stages) ? pipeline.stages.map((s) => s.key) : [];
        if (validKeys.length > 0 && !validKeys.includes(stage)) {
          return res.status(400).json(
            errorResponse(`Invalid stage "${stage}". Valid stages: ${validKeys.join(', ')}`)
          );
        }
      }
    }

    const stageChanging = stage !== undefined && stage !== existing.stage;

    const updated = await prisma.pipelineDeal.update({
      where: { id },
      data: {
        ...(stage !== undefined && { stage }),
        ...(value !== undefined && { value }),
        ...(probability !== undefined && { probability }),
      },
      include: {
        lead: { select: { id: true, firstName: true, lastName: true, email: true, company: true } },
      },
    });

    // Record stage transition
    if (stageChanging) {
      await prisma.stageTransition.create({
        data: { dealId: id, fromStage: existing.stage, toStage: stage },
      });
    }

    return res.status(200).json(successResponse(updated, 'Deal updated'));
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /pipeline/:id
 */
const deleteDeal = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { organizationId } = req.user;

    const existing = await prisma.pipelineDeal.findFirst({
      where: { id, lead: { organizationId } },
    });
    if (!existing) {
      return res.status(404).json(errorResponse('Deal not found'));
    }

    await prisma.pipelineDeal.delete({ where: { id } });

    return res.status(200).json(successResponse(null, 'Deal deleted'));
  } catch (error) {
    next(error);
  }
};

module.exports = { getDeals, createDeal, updateDeal, deleteDeal };
