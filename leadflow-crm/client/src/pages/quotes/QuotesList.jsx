import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, FileText, Send, DollarSign, Trash2, ExternalLink } from 'lucide-react'
import toast from 'react-hot-toast'
import { quotesApi } from '../../api/quotes.api'
import { leadsApi } from '../../api/leads.api'
import { formatCurrency, formatRelativeTime, getInitials } from '../../utils/format'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Modal from '../../components/ui/Modal'
import Spinner from '../../components/ui/Spinner'
import Badge from '../../components/ui/Badge'

const STATUS_TABS = [
  { key: '', label: 'All' },
  { key: 'DRAFT', label: 'Draft' },
  { key: 'SENT', label: 'Sent' },
  { key: 'PAID', label: 'Paid' },
]

const STATUS_BADGE_MAP = {
  DRAFT: 'draft',
  SENT: 'sent',
  PAID: 'paid',
}

function LeadSearchInput({ selectedLead, onSelect }) {
  const [search, setSearch] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)

  const { data: leadsData } = useQuery({
    queryKey: ['leads-quote-search', search],
    queryFn: () => leadsApi.getLeads({ search, limit: 8 }).then((r) => r.data),
    enabled: search.length > 1,
  })

  const leads = leadsData?.data ?? []

  return (
    <div className="relative">
      <label className="block text-sm font-medium text-gray-700 mb-1">Lead *</label>
      <input
        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500"
        placeholder="Search lead..."
        value={selectedLead ? `${selectedLead.firstName} ${selectedLead.lastName}` : search}
        onChange={(e) => { setSearch(e.target.value); onSelect(null); setShowDropdown(true) }}
        onFocus={() => setShowDropdown(true)}
      />
      {showDropdown && leads.length > 0 && !selectedLead && (
        <div className="absolute top-full left-0 right-0 z-20 bg-white border border-gray-200 rounded-lg shadow-lg mt-1 max-h-48 overflow-y-auto">
          {leads.map((lead) => (
            <button
              key={lead.id}
              type="button"
              className="w-full px-3 py-2.5 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
              onClick={() => { onSelect(lead); setSearch(''); setShowDropdown(false) }}
            >
              <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-700">
                {getInitials(lead.firstName, lead.lastName)}
              </div>
              <div>
                <p className="font-medium text-gray-800">{lead.firstName} {lead.lastName}</p>
                {lead.company && <p className="text-xs text-gray-400">{lead.company}</p>}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

const EMPTY_LINE_ITEM = () => ({ description: '', qty: 1, price: 0 })

function CreateQuoteModal({ isOpen, onClose }) {
  const queryClient = useQueryClient()
  const [selectedLead, setSelectedLead] = useState(null)
  const [lineItems, setLineItems] = useState([EMPTY_LINE_ITEM()])
  const [taxRate, setTaxRate] = useState(0)

  const updateLineItem = (index, field, value) => {
    setLineItems((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, [field]: value } : item
      )
    )
  }

  const addLineItem = () => setLineItems((prev) => [...prev, EMPTY_LINE_ITEM()])

  const removeLineItem = (index) =>
    setLineItems((prev) => prev.filter((_, i) => i !== index))

  const subtotal = useMemo(
    () => lineItems.reduce((sum, item) => sum + (parseFloat(item.price) || 0) * (parseInt(item.qty) || 0), 0),
    [lineItems]
  )

  const total = useMemo(
    () => subtotal * (1 + (parseFloat(taxRate) || 0) / 100),
    [subtotal, taxRate]
  )

  const mutation = useMutation({
    mutationFn: (data) => quotesApi.createQuote(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotes'] })
      toast.success('Quote created!')
      onClose()
      setSelectedLead(null)
      setLineItems([EMPTY_LINE_ITEM()])
      setTaxRate(0)
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed to create quote'),
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!selectedLead) { toast.error('Please select a lead'); return }
    mutation.mutate({
      leadId: selectedLead.id,
      lineItems: lineItems.map((item) => ({
        description: item.description,
        qty: parseInt(item.qty, 10) || 1,
        price: parseFloat(item.price) || 0,
      })),
      taxRate: parseFloat(taxRate) || 0,
      totalAmount: total,
    })
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create Quote" size="xl">
      <form onSubmit={handleSubmit} className="space-y-5">
        <LeadSearchInput selectedLead={selectedLead} onSelect={setSelectedLead} />

        {/* Line items */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-gray-700">Line Items</label>
          </div>
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="min-w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Description</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 w-20">Qty</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 w-28">Price</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 w-28">Subtotal</th>
                  <th className="px-3 py-2 w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {lineItems.map((item, i) => {
                  const lineSubtotal = (parseFloat(item.price) || 0) * (parseInt(item.qty) || 0)
                  return (
                    <tr key={i}>
                      <td className="px-3 py-2">
                        <input
                          className="w-full text-sm border-0 focus:ring-0 focus:outline-none"
                          placeholder="Product / service description"
                          value={item.description}
                          onChange={(e) => updateLineItem(i, 'description', e.target.value)}
                          required
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min="1"
                          className="w-full text-sm border-0 focus:ring-0 focus:outline-none text-center"
                          value={item.qty}
                          onChange={(e) => updateLineItem(i, 'qty', e.target.value)}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className="w-full text-sm border-0 focus:ring-0 focus:outline-none"
                          placeholder="0.00"
                          value={item.price}
                          onChange={(e) => updateLineItem(i, 'price', e.target.value)}
                        />
                      </td>
                      <td className="px-3 py-2 text-sm font-medium text-gray-800">
                        {formatCurrency(lineSubtotal)}
                      </td>
                      <td className="px-3 py-2">
                        {lineItems.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeLineItem(i)}
                            className="text-gray-300 hover:text-red-500 transition-colors"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            onClick={addLineItem}
            className="mt-2 text-sm text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1"
          >
            <Plus className="h-4 w-4" /> Add line item
          </button>
        </div>

        {/* Tax & total */}
        <div className="flex items-end justify-end gap-4">
          <div className="w-40">
            <Input
              label="Tax Rate (%)"
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={taxRate}
              onChange={(e) => setTaxRate(e.target.value)}
              placeholder="0"
            />
          </div>
          <div className="text-right pb-0.5">
            <p className="text-xs text-gray-500">Total Amount</p>
            <p className="text-2xl font-bold text-gray-900">{formatCurrency(total)}</p>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={mutation.isPending}>Create Quote</Button>
        </div>
      </form>
    </Modal>
  )
}

export default function QuotesList() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [statusFilter, setStatusFilter] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)

  const { data, isLoading } = useQuery({
    queryKey: ['quotes', statusFilter],
    queryFn: () =>
      quotesApi.getQuotes({ status: statusFilter || undefined }).then((r) => r.data),
  })

  const quotes = data?.data ?? []

  const sendMutation = useMutation({
    mutationFn: (id) => quotesApi.sendQuote(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotes'] })
      toast.success('Quote sent!')
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed to send quote'),
  })

  const payMutation = useMutation({
    mutationFn: (id) => quotesApi.payQuote(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotes'] })
      toast.success('Quote marked as paid!')
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed to mark as paid'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => quotesApi.deleteQuote(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotes'] })
      toast.success('Quote deleted')
      setDeleteTarget(null)
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed to delete quote'),
  })

  const handleViewPdf = async (id) => {
    try {
      const url = await quotesApi.downloadPdf(id)
      window.open(typeof url === 'string' ? url : url?.data?.url || url?.data, '_blank')
    } catch {
      toast.error('Failed to open PDF')
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Quotes</h1>
          <p className="text-sm text-gray-500 mt-0.5">{quotes.length} quotes</p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" /> Create Quote
        </Button>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setStatusFilter(tab.key)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              statusFilter === tab.key
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-16"><Spinner size="lg" /></div>
        ) : quotes.length === 0 ? (
          <div className="text-center py-16">
            <FileText className="mx-auto h-10 w-10 text-gray-300 mb-3" />
            <p className="text-gray-500 font-medium">No quotes found</p>
            <p className="text-gray-400 text-sm mt-1">Create your first quote to send to a lead</p>
            <Button size="sm" className="mt-4" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> Create Quote
            </Button>
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Lead</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Company</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {quotes.map((quote) => (
                <tr key={quote.id} className="hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => navigate('/quotes/' + quote.id)}>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-700 flex-shrink-0">
                        {getInitials(quote.lead?.firstName, quote.lead?.lastName)}
                      </div>
                      <span className="text-sm font-medium text-gray-900">
                        {quote.lead?.firstName} {quote.lead?.lastName}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">{quote.lead?.company || '—'}</td>
                  <td className="px-6 py-4">
                    <span className="text-sm font-semibold text-gray-900">
                      {formatCurrency(quote.totalAmount)}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <Badge variant={STATUS_BADGE_MAP[quote.status] || 'gray'}>{quote.status}</Badge>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">{formatRelativeTime(quote.createdAt)}</td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                        onClick={() => handleViewPdf(quote.id)}
                        title="View PDF"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </button>
                      {quote.status === 'DRAFT' && (
                        <button
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          onClick={() => sendMutation.mutate(quote.id)}
                          title="Send quote"
                          disabled={sendMutation.isPending}
                        >
                          <Send className="h-4 w-4" />
                        </button>
                      )}
                      {quote.status === 'SENT' && (
                        <button
                          className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                          onClick={() => payMutation.mutate(quote.id)}
                          title="Mark as paid"
                          disabled={payMutation.isPending}
                        >
                          <DollarSign className="h-4 w-4" />
                        </button>
                      )}
                      {quote.status === 'DRAFT' && (
                        <button
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          onClick={() => setDeleteTarget(quote.id)}
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <CreateQuoteModal isOpen={createOpen} onClose={() => setCreateOpen(false)} />

      <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete Quote" size="sm">
        <p className="text-sm text-gray-600 mb-6">Are you sure you want to delete this quote? This cannot be undone.</p>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button variant="danger" loading={deleteMutation.isPending} onClick={() => deleteMutation.mutate(deleteTarget)}>
            Delete
          </Button>
        </div>
      </Modal>
    </div>
  )
}
