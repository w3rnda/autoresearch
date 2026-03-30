'use strict'
const router = require('express').Router()
const { authenticate } = require('../middleware/auth.middleware')
const ctrl = require('../controllers/quotes.controller')

router.use(authenticate)
router.get('/', ctrl.getQuotes)
router.post('/', ctrl.createQuote)
router.get('/:id', ctrl.getQuoteById)
router.put('/:id', ctrl.updateQuote)
router.delete('/:id', ctrl.deleteQuote)
router.get('/:id/pdf', ctrl.downloadQuotePdf)
router.post('/:id/send', ctrl.sendQuote)
router.post('/:id/pay', ctrl.payQuote)

module.exports = router
