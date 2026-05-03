'use strict';

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth.middleware');
const searchController = require('../controllers/search.controller');

// GET /api/v1/search?q=<term>
router.get('/', authenticate, searchController.search);

module.exports = router;
