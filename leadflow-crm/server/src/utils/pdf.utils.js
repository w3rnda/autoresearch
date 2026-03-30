'use strict'
const PDFDocument = require('pdfkit')

async function generateQuotePdf(quote, lead) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 })
    const chunks = []
    doc.on('data', chunk => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    // Header
    doc.fontSize(24).font('Helvetica-Bold').text('LeadFlow CRM', 50, 50)
    doc.fontSize(10).font('Helvetica').fillColor('#666').text('Your AI-Powered CRM', 50, 80)
    doc.fillColor('#000')

    // Quote info
    doc.fontSize(18).font('Helvetica-Bold').text('QUOTE', 400, 50, { align: 'right' })
    doc.fontSize(10).font('Helvetica').text(`Quote #${quote.id.slice(-8).toUpperCase()}`, 400, 75, { align: 'right' })
    doc.text(`Date: ${new Date(quote.createdAt).toLocaleDateString()}`, 400, 90, { align: 'right' })
    doc.text(`Status: ${quote.status}`, 400, 105, { align: 'right' })

    // Divider
    doc.moveTo(50, 130).lineTo(550, 130).stroke()

    // Bill to
    doc.fontSize(12).font('Helvetica-Bold').text('Bill To:', 50, 145)
    doc.fontSize(10).font('Helvetica')
      .text(`${lead.firstName} ${lead.lastName}`, 50, 162)
      .text(lead.email, 50, 177)
    if (lead.company) doc.text(lead.company, 50, 192)

    // Items table header
    const tableTop = 240
    doc.fontSize(10).font('Helvetica-Bold')
      .text('Description', 50, tableTop)
      .text('Qty', 300, tableTop)
      .text('Unit Price', 370, tableTop)
      .text('Subtotal', 470, tableTop)
    doc.moveTo(50, tableTop + 15).lineTo(550, tableTop + 15).stroke()

    // Items
    const items = Array.isArray(quote.items) ? quote.items : []
    let y = tableTop + 25
    for (const item of items) {
      const subtotal = (item.qty || 1) * (item.price || 0)
      doc.fontSize(10).font('Helvetica')
        .text(item.name || 'Item', 50, y)
        .text(String(item.qty || 1), 300, y)
        .text(`$${Number(item.price || 0).toFixed(2)}`, 370, y)
        .text(`$${subtotal.toFixed(2)}`, 470, y)
      y += 20
    }

    // Totals
    doc.moveTo(350, y + 5).lineTo(550, y + 5).stroke()
    y += 15
    const subtotalAmt = items.reduce((s, i) => s + (i.qty || 1) * (i.price || 0), 0)
    const taxAmt = subtotalAmt * (quote.taxRate || 0) / 100
    doc.fontSize(10).font('Helvetica')
      .text('Subtotal:', 370, y).text(`$${subtotalAmt.toFixed(2)}`, 470, y)
    y += 18
    doc.text(`Tax (${quote.taxRate || 0}%):`, 370, y).text(`$${taxAmt.toFixed(2)}`, 470, y)
    y += 18
    doc.fontSize(12).font('Helvetica-Bold')
      .text('Total:', 370, y).text(`$${Number(quote.totalAmount || 0).toFixed(2)}`, 470, y)

    doc.end()
  })
}

module.exports = { generateQuotePdf }
