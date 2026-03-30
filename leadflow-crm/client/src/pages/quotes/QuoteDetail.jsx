import { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, FileText, Send, DollarSign, Trash2, Plus, Download } from 'lucide-react'
import toast from 'react-hot-toast'
import { quotesApi } from '../../api/quotes.api'
import { formatCurrency, formatDate } from '../../utils/format'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Badge from '../../components/ui/Badge'
import Spinner from '../../components/ui/Spinner'
import Modal from '../../components/ui/Modal'

const STATUS_BADGE_MAP = { DRAFT: 'draft', SENT: 'sent', PAID: 'paid' }

const EMPTY_ITEM = () => ({ description: '', qty: 1, price: 0 })

export default function QuoteDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [lineItems, setLineItems] = useState(null)
  const [taxRate, setTaxRate] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const { data: quote, isLoading, isError } = useQuery({
    queryKey: ['quote', id],
    queryFn: () => quotesApi.getQuoteById(id).then(r => r.data.data),
    onSuccess: (q) => {
      if (lineItems === null) setLineItems(q.items || [EMPTY_ITEM()])
      if (taxRate === null) setTaxRate(q.taxRate ?? 0)
    },
  })

  const currentItems = lineItems ?? quote?.items ?? [EMPTY_ITEM()]
  const currentTax = taxRate ?? quote?.taxRate ?? 0

  const subtotal = useMemo(
    () => currentItems.reduce((s, item) => s + (parseFloat(item.price) || 0) * (parseInt(item.qty) || 0), 0),
    [currentItems]
  )
  const total = useMemo(() => subtotal * (1 + (parseFloat(currentTax) || 0) / 100), [subtotal, currentTax])

  const updateItem = (i, field, value) =>
    setLineItems(prev => prev.map((item, idx) => idx === i ? { ...item, [field]: value } : item))

  const addItem = () => setLineItems(prev => [...prev, EMPTY_ITEM()])

  const removeItem = (i) => setLineItems(prev => prev.filter((_, idx) => idx !== i))

  const saveMutation = useMutation({
    mutationFn: () => quotesApi.updateQuote(id, {
      items: currentItems.map(item => ({
        description: item.description,
        qty: parseInt(item.qty, 10) || 1,
        price: parseFloat(item.price) || 0,
      })),
      taxRate: parseFloat(currentTax) || 0,
      totalAmount: total,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quote', id] })
      queryClient.invalidateQueries({ queryKey: ['quotes'] })
      toast.success('Quote saved!')
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed to save'),
  })

  const sendMutation = useMutation({
    mutationFn: () => quotesApi.sendQuote(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quote', id] })
      toast.success('Quote sent!')
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed to send'),
  })

  const payMutation = useMutation({
    mutationFn: () => quotesApi.payQuote(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quote', id] })
      toast.success('Marked as paid!')
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed to mark paid'),
  })

  const deleteMutation = useMutation({
    mutationFn: () => quotesApi.deleteQuote(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotes'] })
      toast.success('Quote deleted')
      navigate('/quotes')
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed to delete'),
  })

  const handleDownloadPdf = async () => {
    try {
      const result = await quotesApi.downloadPdf(id)
      const url = typeof result === 'string' ? result : result?.data?.url || result?.data
      if (url) window.open(url, '_blank')
      else toast.error('PDF not available')
    } catch {
      toast.error('Failed to download PDF')
    }
  }

  if (isLoading) return <div className="flex justify-center items-center h-64"><Spinner size="lg" /></div>
  if (isError || !quote) return (
    <div className="p-6 text-center">
      <p className="text-gray-500">Quote not found.</p>
      <Button variant="secondary" size="sm" className="mt-4" onClick={() => navigate('/quotes')}>Back to Quotes</Button>
    </div>
  )

  const lead = quote.lead
  const isDraft = quote.status === 'DRAFT'
  const isSent = quote.status === 'SENT'

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Back */}
      <button onClick={() => navigate('/quotes')} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors">
        <ArrowLeft className="h-4 w-4" /> Quotes
      </button>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <FileText className="h-6 w-6 text-indigo-500" />
            <h1 className="text-2xl font-bold text-gray-900">Quote #{id.slice(-8).toUpperCase()}</h1>
            <Badge variant={STATUS_BADGE_MAP[quote.status] || 'gray'}>{quote.status}</Badge>
          </div>
          {lead && (
            <p className="text-gray-500 text-sm mt-1">
              {lead.firstName} {lead.lastName}{lead.company ? ` · ${lead.company}` : ''}
            </p>
          )}
          <p className="text-xs text-gray-400 mt-0.5">Created {formatDate(quote.createdAt)}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={handleDownloadPdf}>
            <Download className="h-4 w-4" /> PDF
          </Button>
          {isDraft && (
            <Button variant="secondary" size="sm" loading={sendMutation.isPending} onClick={() => sendMutation.mutate()}>
              <Send className="h-4 w-4" /> Send
            </Button>
          )}
          {isSent && (
            <Button size="sm" loading={payMutation.isPending} onClick={() => payMutation.mutate()}>
              <DollarSign className="h-4 w-4" /> Mark Paid
            </Button>
          )}
          {isDraft && (
            <Button variant="danger" size="sm" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Line items editor */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">Line Items</h2>
        </div>
        <table className="min-w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-24">Qty</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-32">Unit Price</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-32">Subtotal</th>
              <th className="px-4 py-3 w-12" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {currentItems.map((item, i) => {
              const lineSub = (parseFloat(item.price) || 0) * (parseInt(item.qty) || 0)
              return (
                <tr key={i}>
                  <td className="px-4 py-2">
                    <input
                      className="w-full text-sm border-0 bg-transparent focus:ring-1 focus:ring-indigo-200 focus:outline-none rounded px-1 py-0.5"
                      placeholder="Product or service"
                      value={item.description}
                      onChange={e => updateItem(i, 'description', e.target.value)}
                      disabled={!isDraft}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="number" min="1"
                      className="w-full text-sm border-0 bg-transparent focus:ring-1 focus:ring-indigo-200 focus:outline-none rounded px-1 py-0.5 text-center"
                      value={item.qty}
                      onChange={e => updateItem(i, 'qty', e.target.value)}
                      disabled={!isDraft}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="number" min="0" step="0.01"
                      className="w-full text-sm border-0 bg-transparent focus:ring-1 focus:ring-indigo-200 focus:outline-none rounded px-1 py-0.5"
                      placeholder="0.00"
                      value={item.price}
                      onChange={e => updateItem(i, 'price', e.target.value)}
                      disabled={!isDraft}
                    />
                  </td>
                  <td className="px-4 py-2 text-sm font-medium text-gray-800">{formatCurrency(lineSub)}</td>
                  <td className="px-4 py-2 text-center">
                    {isDraft && currentItems.length > 1 && (
                      <button onClick={() => removeItem(i)} className="text-gray-300 hover:text-red-500 transition-colors">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {isDraft && (
          <div className="px-4 py-3 border-t border-gray-50">
            <button onClick={addItem} className="text-sm text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1">
              <Plus className="h-4 w-4" /> Add line item
            </button>
          </div>
        )}
      </div>

      {/* Totals + save */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-end justify-end gap-6">
          <div className="w-40">
            <label className="block text-xs font-medium text-gray-500 mb-1">Tax Rate (%)</label>
            <input
              type="number" min="0" max="100" step="0.1"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200"
              value={currentTax}
              onChange={e => setTaxRate(e.target.value)}
              disabled={!isDraft}
            />
          </div>
          <div className="text-right space-y-1">
            <div className="flex justify-between gap-8 text-sm text-gray-600">
              <span>Subtotal</span><span className="font-medium">{formatCurrency(subtotal)}</span>
            </div>
            <div className="flex justify-between gap-8 text-sm text-gray-600">
              <span>Tax ({currentTax}%)</span><span className="font-medium">{formatCurrency(total - subtotal)}</span>
            </div>
            <div className="flex justify-between gap-8 text-lg font-bold text-gray-900 pt-1 border-t border-gray-100">
              <span>Total</span><span>{formatCurrency(total)}</span>
            </div>
          </div>
        </div>
        {isDraft && (
          <div className="flex justify-end mt-4 pt-4 border-t border-gray-100">
            <Button loading={saveMutation.isPending} onClick={() => saveMutation.mutate()}>Save Changes</Button>
          </div>
        )}
      </div>

      {/* Delete confirm modal */}
      <Modal isOpen={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete Quote" size="sm">
        <p className="text-sm text-gray-600 mb-6">Are you sure? This cannot be undone.</p>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setConfirmDelete(false)}>Cancel</Button>
          <Button variant="danger" loading={deleteMutation.isPending} onClick={() => deleteMutation.mutate()}>Delete</Button>
        </div>
      </Modal>
    </div>
  )
}
