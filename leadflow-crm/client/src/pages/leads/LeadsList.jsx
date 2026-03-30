import { useState, useRef } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Upload, Search, Trash2, Edit2, Layers, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { leadsApi } from '../../api/leads.api'
import { segmentsApi } from '../../api/segments.api'
import { useDebounce } from '../../hooks/useDebounce'
import { formatRelativeTime, getInitials } from '../../utils/format'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Badge from '../../components/ui/Badge'
import Modal from '../../components/ui/Modal'
import Select from '../../components/ui/Select'
import Spinner from '../../components/ui/Spinner'
import Pagination from '../../components/ui/Pagination'

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'COLD', label: 'Cold' },
  { value: 'WARM', label: 'Warm' },
  { value: 'HOT', label: 'Hot' },
  { value: 'CUSTOMER', label: 'Customer' },
]

const SOURCE_OPTIONS = [
  { value: '', label: 'All Sources' },
  { value: 'WEBSITE', label: 'Website' },
  { value: 'REFERRAL', label: 'Referral' },
  { value: 'COLD_OUTREACH', label: 'Cold Outreach' },
  { value: 'SOCIAL_MEDIA', label: 'Social Media' },
  { value: 'EVENT', label: 'Event' },
  { value: 'OTHER', label: 'Other' },
]

const STATUS_BADGE_MAP = {
  COLD: 'cold',
  WARM: 'warm',
  HOT: 'hot',
  CUSTOMER: 'customer',
}

function scoreColor(score) {
  if (score >= 60) return 'text-red-600 font-bold'
  if (score >= 30) return 'text-yellow-600 font-semibold'
  return 'text-gray-400'
}

function CreateLeadModal({ isOpen, onClose }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', phone: '',
    company: '', source: '', status: 'COLD', tags: '',
  })

  const mutation = useMutation({
    mutationFn: (data) => leadsApi.createLead(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      toast.success('Lead created!')
      onClose()
      setForm({ firstName: '', lastName: '', email: '', phone: '', company: '', source: '', status: 'COLD', tags: '' })
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed to create lead'),
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    const payload = {
      ...form,
      tags: form.tags ? form.tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
    }
    mutation.mutate(payload)
  }

  const set = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }))

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add New Lead" size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Input label="First Name *" value={form.firstName} onChange={set('firstName')} placeholder="Jane" required />
          <Input label="Last Name *" value={form.lastName} onChange={set('lastName')} placeholder="Doe" required />
        </div>
        <Input label="Email *" type="email" value={form.email} onChange={set('email')} placeholder="jane@example.com" required />
        <div className="grid grid-cols-2 gap-4">
          <Input label="Phone" type="tel" value={form.phone} onChange={set('phone')} placeholder="+1 555 000 0000" />
          <Input label="Company" value={form.company} onChange={set('company')} placeholder="Acme Corp" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Select
            label="Source"
            options={SOURCE_OPTIONS.slice(1)}
            value={form.source}
            onChange={set('source')}
            placeholder="Select source"
          />
          <Select
            label="Status"
            options={STATUS_OPTIONS.slice(1)}
            value={form.status}
            onChange={set('status')}
          />
        </div>
        <Input label="Tags (comma-separated)" value={form.tags} onChange={set('tags')} placeholder="vip, follow-up" />
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={mutation.isPending}>Create Lead</Button>
        </div>
      </form>
    </Modal>
  )
}

function ImportModal({ isOpen, onClose }) {
  const queryClient = useQueryClient()
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState([])
  const [headers, setHeaders] = useState([])
  const fileRef = useRef()

  const handleFile = (e) => {
    const f = e.target.files[0]
    if (!f) return
    setFile(f)
    const reader = new FileReader()
    reader.onload = (ev) => {
      const lines = ev.target.result.split('\n').filter(Boolean)
      const cols = lines[0].split(',').map((c) => c.trim().replace(/^"|"$/g, ''))
      setHeaders(cols)
      const rows = lines.slice(1, 4).map((line) =>
        line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''))
      )
      setPreview(rows)
    }
    reader.readAsText(f)
  }

  const mutation = useMutation({
    mutationFn: (formData) => leadsApi.importLeads(formData),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      const count = res.data?.data?.imported ?? res.data?.imported ?? '?'
      toast.success(`Imported ${count} leads!`)
      onClose()
      setFile(null)
      setPreview([])
      setHeaders([])
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Import failed'),
  })

  const handleImport = () => {
    if (!file) return
    const fd = new FormData()
    fd.append('file', file)
    mutation.mutate(fd)
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Import Leads from CSV" size="lg">
      <div className="space-y-4">
        <div
          className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-indigo-400 transition-colors"
          onClick={() => fileRef.current?.click()}
        >
          <Upload className="mx-auto h-8 w-8 text-gray-400 mb-2" />
          <p className="text-sm text-gray-600">{file ? file.name : 'Click to select a CSV file'}</p>
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFile} />
        </div>

        {preview.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full text-xs">
              <thead className="bg-gray-50">
                <tr>
                  {headers.map((h) => (
                    <th key={h} className="px-3 py-2 text-left text-gray-500 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {preview.map((row, i) => (
                  <tr key={i}>
                    {row.map((cell, j) => (
                      <td key={j} className="px-3 py-2 text-gray-700">{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-gray-400 px-3 py-2">Showing first 3 rows preview</p>
          </div>
        )}

        <div className="flex justify-end gap-3">
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button onClick={handleImport} loading={mutation.isPending} disabled={!file}>
            Import CSV
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function ConfirmDeleteDialog({ isOpen, onClose, onConfirm, loading }) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Delete Lead" size="sm">
      <p className="text-sm text-gray-600 mb-6">Are you sure you want to delete this lead? This action cannot be undone.</p>
      <div className="flex justify-end gap-3">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant="danger" loading={loading} onClick={onConfirm}>Delete</Button>
      </div>
    </Modal>
  )
}

export default function LeadsList() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [sourceFilter, setSourceFilter] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)

  // Segment filter — populated from URL query params (?segmentId=xxx&segmentName=yyy)
  const segmentId = searchParams.get('segmentId')
  const segmentName = searchParams.get('segmentName')

  const debouncedSearch = useDebounce(search, 400)

  // When a segment is active, fetch via segment leads endpoint
  const { data, isLoading } = useQuery({
    queryKey: segmentId
      ? ['segment-leads', segmentId, page]
      : ['leads', page, debouncedSearch, statusFilter, sourceFilter],
    queryFn: () => segmentId
      ? segmentsApi.getSegmentLeads(segmentId, { page, limit: 20 }).then(r => r.data)
      : leadsApi.getLeads({
          page,
          limit: 20,
          search: debouncedSearch || undefined,
          status: statusFilter || undefined,
          source: sourceFilter || undefined,
        }).then((r) => r.data),
    keepPreviousData: true,
  })

  const leads = data?.data ?? []
  const pagination = data?.pagination ?? {}
  const total = pagination.total ?? 0
  const totalPages = pagination.totalPages ?? 1

  const deleteMutation = useMutation({
    mutationFn: (id) => leadsApi.deleteLead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      toast.success('Lead deleted')
      setDeleteTarget(null)
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed to delete lead'),
  })

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Leads</h1>
          <p className="text-sm text-gray-500 mt-0.5">{total.toLocaleString()} total leads</p>
        </div>
        <div className="flex gap-3">
          <Button variant="secondary" size="sm" onClick={() => setImportOpen(true)}>
            <Upload className="h-4 w-4" /> Import CSV
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> Add Lead
          </Button>
        </div>
      </div>

      {/* Segment filter banner */}
      {segmentId && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/20 text-sm text-indigo-700 dark:text-indigo-300">
          <Layers className="h-4 w-4 flex-shrink-0" />
          <span>Segment: <strong>{segmentName || 'Selected'}</strong></span>
          <Link to="/leads" className="ml-auto p-1 rounded hover:bg-indigo-100 dark:hover:bg-indigo-500/20 transition-colors" title="Clear segment filter">
            <X className="h-3.5 w-3.5" />
          </Link>
        </div>
      )}

      {/* Filters */}
      <div className={`flex flex-wrap gap-3 ${segmentId ? 'opacity-50 pointer-events-none' : ''}`}>
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500"
            placeholder="Search leads..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          />
        </div>
        <div className="w-40">
          <Select
            options={STATUS_OPTIONS}
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
            placeholder="All Statuses"
          />
        </div>
        <div className="w-44">
          <Select
            options={SOURCE_OPTIONS}
            value={sourceFilter}
            onChange={(e) => { setSourceFilter(e.target.value); setPage(1) }}
            placeholder="All Sources"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-16"><Spinner size="lg" /></div>
        ) : leads.length === 0 ? (
          <div className="text-center py-16">
            <div className="mx-auto w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-4">
              <Search className="h-5 w-5 text-gray-400" />
            </div>
            <p className="text-gray-500 font-medium">No leads found</p>
            <p className="text-gray-400 text-sm mt-1">Add your first lead to get started</p>
            <div className="mt-4">
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" /> Add your first lead
              </Button>
            </div>
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Company</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Score</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Assigned To</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Source</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {leads.map((lead) => (
                <tr
                  key={lead.id}
                  onClick={() => navigate(`/leads/${lead.id}`)}
                  className="hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-700 flex-shrink-0">
                        {getInitials(lead.firstName, lead.lastName)}
                      </div>
                      <span className="text-sm font-medium text-gray-900">
                        {lead.firstName} {lead.lastName}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">{lead.email}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{lead.company || '—'}</td>
                  <td className="px-6 py-4">
                    <Badge variant={STATUS_BADGE_MAP[lead.status] || 'gray'}>
                      {lead.status}
                    </Badge>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`text-sm ${scoreColor(lead.score ?? 0)}`}>
                      {lead.score ?? 0}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {lead.assignedTo ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-5 w-5 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center text-[10px] font-bold text-indigo-700 dark:text-indigo-300">
                          {lead.assignedTo.name.charAt(0).toUpperCase()}
                        </span>
                        <span className="truncate max-w-[80px]">{lead.assignedTo.name}</span>
                      </span>
                    ) : (
                      <span className="text-gray-300 dark:text-gray-600 text-xs">Unassigned</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">{lead.source || '—'}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{formatRelativeTime(lead.createdAt)}</td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                      <button
                        className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                        onClick={() => navigate(`/leads/${lead.id}`)}
                        title="Edit"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        onClick={() => setDeleteTarget(lead.id)}
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-end">
          <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
        </div>
      )}

      <CreateLeadModal isOpen={createOpen} onClose={() => setCreateOpen(false)} />
      <ImportModal isOpen={importOpen} onClose={() => setImportOpen(false)} />
      <ConfirmDeleteDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteMutation.mutate(deleteTarget)}
        loading={deleteMutation.isPending}
      />
    </div>
  )
}
