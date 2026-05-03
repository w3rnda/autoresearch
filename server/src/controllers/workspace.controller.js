'use strict';

const path = require('path');
const fs = require('fs');
const multer = require('multer');
const prisma = require('../prisma');
const { successResponse, errorResponse } = require('../utils/response.utils');

// ─── File upload setup ────────────────────────────────────────────────────────

const UPLOAD_DIR = path.join(__dirname, '../../uploads/documents');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}-${file.originalname}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/png',
      'image/jpeg',
      'image/gif',
      'text/plain',
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('File type not allowed'), false);
    }
  },
});

// Export multer middleware for use in routes
const uploadMiddleware = upload.single('file');

// ─── Ordered closing stages ───────────────────────────────────────────────────

const STAGE_ORDER = [
  'DEAL_INITIATED',
  'PROPOSAL_SHARED',
  'CONTRACT_SENT',
  'CONTRACT_SIGNED',
  'DEPOSIT_PAID',
  'WORK_STARTED',
  'FULLY_PAID',
];

const STAGE_LABELS = {
  DEAL_INITIATED: 'Deal Initiated',
  PROPOSAL_SHARED: 'Proposal Shared',
  CONTRACT_SENT: 'Contract Sent',
  CONTRACT_SIGNED: 'Contract Signed',
  DEPOSIT_PAID: 'Deposit Paid',
  WORK_STARTED: 'Work Started',
  FULLY_PAID: 'Fully Paid / Closed',
};

// ─── Automation: stage-triggered notifications ───────────────────────────────

async function triggerStageAutomation(workspaceId, stage, lead, userId) {
  const messages = {
    PROPOSAL_SHARED: `Follow up with ${lead.firstName} ${lead.lastName} about the proposal`,
    CONTRACT_SENT: `Prompt ${lead.firstName} ${lead.lastName} to sign the contract`,
    CONTRACT_SIGNED: `Request deposit from ${lead.firstName} ${lead.lastName}`,
    DEPOSIT_PAID: `${lead.firstName} ${lead.lastName} paid deposit — work can begin`,
    FULLY_PAID: `${lead.firstName} ${lead.lastName} is fully paid and closed`,
  };

  const message = messages[stage];
  if (!message) return;

  await prisma.notification.create({
    data: {
      userId,
      message,
      type: stage === 'FULLY_PAID' ? 'SUCCESS' : 'INFO',
    },
  });

  // Mark lead as CUSTOMER when fully paid
  if (stage === 'FULLY_PAID') {
    await prisma.lead.update({
      where: { id: lead.id },
      data: { status: 'CUSTOMER' },
    });
  }
}

// ─── Helper: get or 404 workspace scoped to org ──────────────────────────────

async function findWorkspace(workspaceId, organizationId) {
  return prisma.dealWorkspace.findFirst({
    where: { id: workspaceId, organizationId },
    include: {
      progress: { orderBy: { createdAt: 'asc' } },
      documents: { orderBy: { createdAt: 'desc' } },
      summary: true,
      payments: { orderBy: { createdAt: 'asc' } },
      lead: { select: { id: true, firstName: true, lastName: true, status: true } },
    },
  });
}

// ─── Controllers ─────────────────────────────────────────────────────────────

/**
 * GET /workspace/lead/:leadId
 * Returns (or auto-creates) the workspace for a given lead.
 */
const getOrCreateWorkspace = async (req, res, next) => {
  try {
    const { leadId } = req.params;
    const { organizationId, id: userId } = req.user;

    // Verify lead belongs to org
    const lead = await prisma.lead.findFirst({ where: { id: leadId, organizationId } });
    if (!lead) return res.status(404).json(errorResponse('Lead not found'));

    let workspace = await prisma.dealWorkspace.findUnique({
      where: { leadId },
      include: {
        progress: { orderBy: { createdAt: 'asc' } },
        documents: { orderBy: { createdAt: 'desc' } },
        summary: true,
        payments: { orderBy: { createdAt: 'asc' } },
        lead: { select: { id: true, firstName: true, lastName: true, status: true } },
      },
    });

    if (!workspace) {
      // Auto-create with all stages initialised as PENDING
      workspace = await prisma.dealWorkspace.create({
        data: {
          leadId,
          organizationId,
          currentStage: 'DEAL_INITIATED',
          progress: {
            create: STAGE_ORDER.map((stage) => ({
              stage,
              status: stage === 'DEAL_INITIATED' ? 'IN_PROGRESS' : 'PENDING',
            })),
          },
        },
        include: {
          progress: { orderBy: { createdAt: 'asc' } },
          documents: { orderBy: { createdAt: 'desc' } },
          summary: true,
          payments: { orderBy: { createdAt: 'asc' } },
          lead: { select: { id: true, firstName: true, lastName: true, status: true } },
        },
      });

      // Notify the creator
      setImmediate(async () => {
        try {
          await prisma.notification.create({
            data: {
              userId,
              message: `Deal workspace opened for ${lead.firstName} ${lead.lastName}`,
              type: 'INFO',
            },
          });
        } catch (_) { /* ignore */ }
      });
    }

    return res.status(200).json(successResponse({ ...workspace, stageOrder: STAGE_ORDER, stageLabels: STAGE_LABELS }));
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /workspace/:id/stage
 * Advance (or manually set) the current closing stage.
 * Body: { stage: ClosingStage }
 */
const updateStage = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { stage } = req.body;
    const { organizationId, id: userId } = req.user;

    if (!STAGE_ORDER.includes(stage)) {
      return res.status(400).json(errorResponse(`Invalid stage. Must be one of: ${STAGE_ORDER.join(', ')}`));
    }

    const workspace = await findWorkspace(id, organizationId);
    if (!workspace) return res.status(404).json(errorResponse('Workspace not found'));

    const stageIndex = STAGE_ORDER.indexOf(stage);
    const currentIndex = STAGE_ORDER.indexOf(workspace.currentStage);

    // Mark all stages up to and including the new stage as COMPLETED
    // Mark stages after as PENDING
    const progressUpdates = STAGE_ORDER.map((s, i) => {
      if (i < stageIndex) return { stage: s, status: 'COMPLETED', completedAt: new Date() };
      if (i === stageIndex) return { stage: s, status: 'IN_PROGRESS', completedAt: null };
      return { stage: s, status: 'PENDING', completedAt: null };
    });

    // Update each progress row
    await Promise.all(
      progressUpdates.map(({ stage: s, status, completedAt }) =>
        prisma.workspaceProgress.updateMany({
          where: { workspaceId: id, stage: s },
          data: { status, ...(completedAt ? { completedAt } : { completedAt: null }) },
        })
      )
    );

    const updated = await prisma.dealWorkspace.update({
      where: { id },
      data: { currentStage: stage },
      include: {
        progress: { orderBy: { createdAt: 'asc' } },
        documents: { orderBy: { createdAt: 'desc' } },
        summary: true,
        payments: { orderBy: { createdAt: 'asc' } },
        lead: { select: { id: true, firstName: true, lastName: true, status: true } },
      },
    });

    // Fire automation if stage advanced
    if (stageIndex > currentIndex) {
      setImmediate(async () => {
        try {
          await triggerStageAutomation(id, stage, workspace.lead, userId);
        } catch (_) { /* ignore */ }
      });
    }

    return res.status(200).json(successResponse({ ...updated, stageOrder: STAGE_ORDER, stageLabels: STAGE_LABELS }));
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /workspace/:id/notes
 * Save workspace-level notes.
 * Body: { notes: string }
 */
const updateNotes = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;
    const { organizationId } = req.user;

    const workspace = await findWorkspace(id, organizationId);
    if (!workspace) return res.status(404).json(errorResponse('Workspace not found'));

    const updated = await prisma.dealWorkspace.update({
      where: { id },
      data: { notes },
      include: {
        progress: { orderBy: { createdAt: 'asc' } },
        documents: { orderBy: { createdAt: 'desc' } },
        summary: true,
        payments: { orderBy: { createdAt: 'asc' } },
        lead: { select: { id: true, firstName: true, lastName: true, status: true } },
      },
    });

    return res.status(200).json(successResponse({ ...updated, stageOrder: STAGE_ORDER, stageLabels: STAGE_LABELS }));
  } catch (error) {
    next(error);
  }
};

// ─── Deal Summary ─────────────────────────────────────────────────────────────

/**
 * PUT /workspace/:id/summary
 * Upsert the deal summary for this workspace.
 */
const upsertSummary = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { organizationId } = req.user;
    const {
      serviceOffered,
      scopeOfWork,
      deliverables,
      pricingBreakdown,
      paymentStructure,
      timeline,
      milestones,
    } = req.body;

    const workspace = await prisma.dealWorkspace.findFirst({ where: { id, organizationId } });
    if (!workspace) return res.status(404).json(errorResponse('Workspace not found'));

    const summary = await prisma.dealSummary.upsert({
      where: { workspaceId: id },
      create: {
        workspaceId: id,
        serviceOffered,
        scopeOfWork,
        deliverables,
        pricingBreakdown,
        paymentStructure,
        timeline,
        milestones,
      },
      update: {
        ...(serviceOffered !== undefined && { serviceOffered }),
        ...(scopeOfWork !== undefined && { scopeOfWork }),
        ...(deliverables !== undefined && { deliverables }),
        ...(pricingBreakdown !== undefined && { pricingBreakdown }),
        ...(paymentStructure !== undefined && { paymentStructure }),
        ...(timeline !== undefined && { timeline }),
        ...(milestones !== undefined && { milestones }),
      },
    });

    return res.status(200).json(successResponse(summary));
  } catch (error) {
    next(error);
  }
};

// ─── Documents ────────────────────────────────────────────────────────────────

/**
 * POST /workspace/:id/documents
 * Upload a file and attach it to this workspace.
 * Multipart form: file + category + notes
 */
const uploadDocument = async (req, res, next) => {
  uploadMiddleware(req, res, async (err) => {
    if (err) return res.status(400).json(errorResponse(err.message));

    try {
      const { id } = req.params;
      const { organizationId } = req.user;
      const { category, notes } = req.body;

      const workspace = await prisma.dealWorkspace.findFirst({ where: { id, organizationId } });
      if (!workspace) return res.status(404).json(errorResponse('Workspace not found'));

      if (!req.file) return res.status(400).json(errorResponse('No file provided'));

      const fileUrl = `/uploads/documents/${req.file.filename}`;

      const doc = await prisma.workspaceDocument.create({
        data: {
          workspaceId: id,
          name: req.file.originalname,
          category: category || 'OTHER',
          fileUrl,
          fileSize: req.file.size,
          mimeType: req.file.mimetype,
          notes: notes || null,
        },
      });

      return res.status(201).json(successResponse(doc, 'Document uploaded'));
    } catch (error) {
      next(error);
    }
  });
};

/**
 * PUT /workspace/:id/documents/:docId
 * Update document metadata (category, notes).
 */
const updateDocument = async (req, res, next) => {
  try {
    const { id, docId } = req.params;
    const { organizationId } = req.user;
    const { category, notes } = req.body;

    const workspace = await prisma.dealWorkspace.findFirst({ where: { id, organizationId } });
    if (!workspace) return res.status(404).json(errorResponse('Workspace not found'));

    const doc = await prisma.workspaceDocument.findFirst({ where: { id: docId, workspaceId: id } });
    if (!doc) return res.status(404).json(errorResponse('Document not found'));

    const updated = await prisma.workspaceDocument.update({
      where: { id: docId },
      data: {
        ...(category !== undefined && { category }),
        ...(notes !== undefined && { notes }),
      },
    });

    return res.status(200).json(successResponse(updated));
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /workspace/:id/documents/:docId
 * Remove a document and delete the file from disk.
 */
const deleteDocument = async (req, res, next) => {
  try {
    const { id, docId } = req.params;
    const { organizationId } = req.user;

    const workspace = await prisma.dealWorkspace.findFirst({ where: { id, organizationId } });
    if (!workspace) return res.status(404).json(errorResponse('Workspace not found'));

    const doc = await prisma.workspaceDocument.findFirst({ where: { id: docId, workspaceId: id } });
    if (!doc) return res.status(404).json(errorResponse('Document not found'));

    // Delete file from disk
    const filePath = path.join(__dirname, '../..', doc.fileUrl);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    await prisma.workspaceDocument.delete({ where: { id: docId } });

    return res.status(200).json(successResponse(null, 'Document deleted'));
  } catch (error) {
    next(error);
  }
};

// ─── Payments ─────────────────────────────────────────────────────────────────

/**
 * POST /workspace/:id/payments
 * Add a payment entry.
 * Body: { type, amount, dueDate?, description? }
 */
const createPayment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { organizationId, id: userId } = req.user;
    const { type, amount, dueDate, description } = req.body;

    if (!amount || isNaN(amount) || amount <= 0) {
      return res.status(400).json(errorResponse('Amount must be a positive number'));
    }

    const workspace = await prisma.dealWorkspace.findFirst({
      where: { id, organizationId },
      include: { lead: { select: { id: true, firstName: true, lastName: true } } },
    });
    if (!workspace) return res.status(404).json(errorResponse('Workspace not found'));

    const payment = await prisma.payment.create({
      data: {
        workspaceId: id,
        type: type || 'INSTALLMENT',
        amount: parseFloat(amount),
        dueDate: dueDate ? new Date(dueDate) : null,
        description: description || null,
        status: 'UNPAID',
      },
    });

    return res.status(201).json(successResponse(payment, 'Payment added'));
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /workspace/:id/payments/:paymentId
 * Update payment status / mark as paid.
 * Body: { status, paidAt? }
 */
const updatePayment = async (req, res, next) => {
  try {
    const { id, paymentId } = req.params;
    const { organizationId, id: userId } = req.user;
    const { status, paidAt, amount, dueDate, description, type } = req.body;

    const workspace = await prisma.dealWorkspace.findFirst({
      where: { id, organizationId },
      include: { lead: { select: { id: true, firstName: true, lastName: true } } },
    });
    if (!workspace) return res.status(404).json(errorResponse('Workspace not found'));

    const payment = await prisma.payment.findFirst({ where: { id: paymentId, workspaceId: id } });
    if (!payment) return res.status(404).json(errorResponse('Payment not found'));

    const updated = await prisma.payment.update({
      where: { id: paymentId },
      data: {
        ...(status !== undefined && { status }),
        ...(paidAt !== undefined && { paidAt: paidAt ? new Date(paidAt) : null }),
        ...(amount !== undefined && { amount: parseFloat(amount) }),
        ...(dueDate !== undefined && { dueDate: dueDate ? new Date(dueDate) : null }),
        ...(description !== undefined && { description }),
        ...(type !== undefined && { type }),
      },
    });

    // If marked as PAID and type is DEPOSIT, auto-advance workspace stage
    if (status === 'PAID' && payment.type === 'DEPOSIT') {
      const currentIdx = STAGE_ORDER.indexOf(workspace.currentStage);
      const depositIdx = STAGE_ORDER.indexOf('DEPOSIT_PAID');
      if (currentIdx < depositIdx) {
        await prisma.dealWorkspace.update({
          where: { id },
          data: { currentStage: 'DEPOSIT_PAID' },
        });
        setImmediate(async () => {
          try {
            await triggerStageAutomation(id, 'DEPOSIT_PAID', workspace.lead, userId);
          } catch (_) { /* ignore */ }
        });
      }
    }

    // If this is the last payment and it's PAID, suggest FULLY_PAID
    if (status === 'PAID' && payment.type === 'FINAL') {
      setImmediate(async () => {
        try {
          await triggerStageAutomation(id, 'FULLY_PAID', workspace.lead, userId);
        } catch (_) { /* ignore */ }
      });
    }

    return res.status(200).json(successResponse(updated));
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /workspace/:id/payments/:paymentId
 */
const deletePayment = async (req, res, next) => {
  try {
    const { id, paymentId } = req.params;
    const { organizationId } = req.user;

    const workspace = await prisma.dealWorkspace.findFirst({ where: { id, organizationId } });
    if (!workspace) return res.status(404).json(errorResponse('Workspace not found'));

    const payment = await prisma.payment.findFirst({ where: { id: paymentId, workspaceId: id } });
    if (!payment) return res.status(404).json(errorResponse('Payment not found'));

    await prisma.payment.delete({ where: { id: paymentId } });

    return res.status(200).json(successResponse(null, 'Payment deleted'));
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getOrCreateWorkspace,
  updateStage,
  updateNotes,
  upsertSummary,
  uploadDocument,
  updateDocument,
  deleteDocument,
  createPayment,
  updatePayment,
  deletePayment,
};
