const express = require('express');
const router = express.Router();
const { body, query } = require('express-validator');
const multer = require('multer');
const { validate } = require('../middleware/validate.middleware');
const { authenticate } = require('../middleware/auth.middleware');
const leadsController = require('../controllers/leads.controller');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'));
    }
  },
});

// All routes require authentication
router.use(authenticate);

// GET /leads
router.get(
  '/',
  [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('search').optional().trim(),
    query('status').optional().isIn(['COLD', 'WARM', 'HOT', 'CUSTOMER']),
    query('source').optional().isIn(['MANUAL', 'CSV', 'API', 'WEBSITE', 'REFERRAL', 'COLD_OUTREACH', 'SOCIAL_MEDIA', 'EVENT', 'OTHER']),
  ],
  validate,
  leadsController.getLeads
);

// POST /leads
router.post(
  '/',
  [
    body('firstName').trim().notEmpty().withMessage('First name is required'),
    body('lastName').trim().notEmpty().withMessage('Last name is required'),
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('phone').optional().trim(),
    body('company').optional().trim(),
    body('title').optional().trim(),
    body('website').optional().trim(),
    body('country').optional().trim(),
    body('city').optional().trim(),
    body('address').optional().trim(),
    body('linkedIn').optional().trim(),
    body('twitter').optional().trim(),
    body('category').optional().trim(),
    body('industry').optional().trim(),
    body('companySize').optional().trim(),
    body('icpFit').optional().trim(),
    body('notes').optional().trim(),
    body('customFields').optional().isObject(),
    body('source').optional().isIn(['MANUAL', 'CSV', 'API', 'WEBSITE', 'REFERRAL', 'COLD_OUTREACH', 'SOCIAL_MEDIA', 'EVENT', 'OTHER']),
    body('status').optional().isIn(['COLD', 'WARM', 'HOT', 'CUSTOMER']),
    body('tags').optional().isArray(),
  ],
  validate,
  leadsController.createLead
);

// GET /leads/export  — must be before /:id to avoid route collision
router.get('/export', leadsController.exportLeads);

// GET /leads/:id
router.get('/:id', leadsController.getLeadById);

// PUT /leads/:id
router.put(
  '/:id',
  [
    body('firstName').optional().trim().notEmpty(),
    body('lastName').optional().trim().notEmpty(),
    body('email').optional().isEmail().normalizeEmail(),
    body('phone').optional().trim(),
    body('company').optional().trim(),
    body('title').optional().trim(),
    body('website').optional().trim(),
    body('country').optional().trim(),
    body('city').optional().trim(),
    body('address').optional().trim(),
    body('linkedIn').optional().trim(),
    body('twitter').optional().trim(),
    body('category').optional().trim(),
    body('industry').optional().trim(),
    body('companySize').optional().trim(),
    body('icpFit').optional().trim(),
    body('notes').optional().trim(),
    body('customFields').optional().isObject(),
    body('status').optional().isIn(['COLD', 'WARM', 'HOT', 'CUSTOMER']),
    body('tags').optional().isArray(),
  ],
  validate,
  leadsController.updateLead
);

// DELETE /leads/:id
router.delete('/:id', leadsController.deleteLead);

// POST /leads/import
router.post('/import', upload.single('file'), leadsController.importLeads);

// POST /leads/:id/enrich
router.post('/:id/enrich', leadsController.enrichLead);

// POST /leads/:id/de-enrich
router.post('/:id/de-enrich', leadsController.deenrichLead);

module.exports = router;
