import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  CheckCircle2, Circle, Clock, ChevronRight, Upload, Trash2, FileText,
  DollarSign, Plus, Check, X, Edit2, Paperclip, AlertCircle, Loader2,
  FileCheck, FileSignature, MessageSquare, Package, File,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { workspaceApi } from '../../api/workspace.api'
import { formatCurrency, formatDate, formatRelativeTime } from '../../utils/format'
import Button from '../ui/Button'
import Input from '../ui/Input'
import Select from '../ui/Select'
import Spinner from '../ui/Spinner'

// ─── Constants ───────────────────────────────────────────────────────────────

const STAGE_ORDER = [
  'DEAL_INITIATED',
  'PROPOSAL_SHARED',
  'CONTRACT_SENT',
  'CONTRACT_SIGNED',
  'DEPOSIT_PAID',
  'WORK_STARTED',
  'FULLY_PAID',
]

const STAGE_LABELS = {
  DEAL_INITIATED:  'Deal Initiated',
  PROPOSAL_SHARED: 'Proposal Shared',
  CONTRACT_SENT:   'Contract Sent',
  CONTRACT_SIGNED: 'Contract Signed',
  DEPOSIT_PAID:    'Deposit Paid',
  WORK_STARTED:    'Work Started',
  FULLY_PAID:      'Fully Paid / Closed',
}

const STAGE_DESCRIPTIONS = {
  DEAL_INITIATED:  'Workspace opened, deal in progress',
  PROPOSAL_SHARED: 'Client received the proposal',
  CONTRACT_SENT:   'Contract sent for review',
  CONTRACT_SIGNED: 'Contract signed by client',
  DEPOSIT_PAID:    'Initial deposit received',
  WORK_STARTED:    'Delivery / onboarding begun',
  FULLY_PAID:      'Full payment received, deal closed',
}

const DOC_CATEGORY_OPTIONS = [
  { value: 'CONTRACT',      label: 'Contract' },
  { value: 'INVOICE',       label: 'Invoice' },
  { value: 'PROPOSAL',      label: 'Proposal' },
  { value: 'LEGAL',         label: 'Legal Document' },
  { value: 'COMMUNICATION', label: 'Communication' },
  { value: 'ASSET',         label: 'Asset / Deliverable' },
  { value: 'OTHER',         label: 'Other' },
]

const PAYMENT_TYPE_OPTIONS = [
  { value: 'DEPOSIT',     label: 'Deposit' },
  { value: 'INSTALLMENT', label: 'Installment' },
  { value: 'FINAL',       label: 'Final Payment' },
  { value: 'OTHER',       label: 'Other' },
]

const PAYMENT_STATUS_OPTIONS = [
  { value: 'UNPAID',  label: 'Unpaid' },
  { value: 'PARTIAL', label: 'Partial' },
  { value: 'PAID',    label: 'Paid' },
  { value: 'OVERDUE', label: 'Overdue' },
]

const DOC_CATEGORY_ICONS = {
  CONTRACT:      <FileSignature className="h-4 w-4" />,
  INVOICE:       <DollarSign className="h-4 w-4" />,
  PROPOSAL:      <FileCheck className="h-4 w-4" />,
  LEGAL:         <FileText className="h-4 w-4" />,
  COMMUNICATION: <MessageSquare className="h-4 w-4" />,
  ASSET:         <Package className="h-4 w-4" />,
  OTHER:         <File className="h-4 w-4" />,
}

const PAYMENT_STATUS_STYLES = {
  UNPAID:  'bg-gray-100 text-gray-600',
  PARTIAL: 'bg-amber-100 text-amber-700',
  PAID:    'bg-green-100 text-green-700',
  OVERDUE: 'bg-red-100 text-red-700',
}

// ─── Progress Tracker ────────────────────────────────────────────────────────

function ProgressTracker({ workspace, onStageChange, isUpdatingStage }) {
  const progress = workspace.progress || []
  const stageMap = Object.fromEntries(progress.map((p) => [p.stage, p]))

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-5">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Closing Progress</h3>
      <div className="space-y-1">
        {STAGE_ORDER.map((stage, idx) => {
          const prog = stageMap[stage]
          const status = prog?.status ?? 'PENDING'
          const isCurrent = workspace.currentStage === stage
          const isCompleted = status === 'COMPLETED'
          const isPending = status === 'PENDING'
          const canAdvance = idx === STAGE_ORDER.indexOf(workspace.currentStage) + 1

          return (
            <div
              key={stage}
              className={`flex items-start gap-3 p-3 rounded-lg transition-all ${
                isCurrent
                  ? 'bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800'
                  : isCompleted
                  ? 'opacity-70'
                  : 'opacity-50'
              }`}
            >
              {/* Icon */}
              <div className="flex-shrink-0 mt-0.5">
                {isCompleted ? (
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                ) : isCurrent ? (
                  <Clock className="h-5 w-5 text-indigo-500 animate-pulse" />
                ) : (
                  <Circle className="h-5 w-5 text-gray-300" />
                )}
              </div>

              {/* Label + description */}
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium leading-tight ${
                  isCurrent ? 'text-indigo-700 dark:text-indigo-300'
                  : isCompleted ? 'text-gray-500 line-through'
                  : 'text-gray-400'
                }`}>
                  {STAGE_LABELS[stage]}
                </p>
                {(isCurrent || isCompleted) && (
                  <p className="text-xs text-gray-400 mt-0.5 leading-tight">
                    {isCompleted && prog?.completedAt
                      ? `Completed ${formatRelativeTime(prog.completedAt)}`
                      : STAGE_DESCRIPTIONS[stage]}
                  </p>
                )}
              </div>

              {/* Advance button */}
              {canAdvance && (
                <button
                  onClick={() => onStageChange(stage)}
                  disabled={isUpdatingStage}
                  className="flex-shrink-0 flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800 disabled:opacity-40 transition-colors"
                  title={`Advance to: ${STAGE_LABELS[stage]}`}
                >
                  {isUpdatingStage ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5" />
                  )}
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* Manual stage selector */}
      <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
        <p className="text-xs text-gray-400 mb-2">Set stage manually</p>
        <Select
          options={STAGE_ORDER.map((s) => ({ value: s, label: STAGE_LABELS[s] }))}
          value={workspace.currentStage}
          onChange={(e) => onStageChange(e.target.value)}
          disabled={isUpdatingStage}
        />
      </div>
    </div>
  )
}

// ─── Deal Summary Panel ───────────────────────────────────────────────────────

function DealSummaryPanel({ workspace, onSave, isSaving }) {
  const existing = workspace.summary || {}
  const [form, setForm] = useState({
    serviceOffered:   existing.serviceOffered   || '',
    scopeOfWork:      existing.scopeOfWork      || '',
    deliverables:     existing.deliverables     || '',
    paymentStructure: existing.paymentStructure || '',
    timeline:         existing.timeline         || '',
  })

  const setField = (field) => (e) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }))

  const handleSave = () => onSave(form)

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-5">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Deal Summary</h3>
      <div className="space-y-3">
        <Input
          label="Service / Package Offered"
          value={form.serviceOffered}
          onChange={setField('serviceOffered')}
          placeholder="e.g. Brand Identity Package — Starter"
        />
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Scope of Work
          </label>
          <textarea
            value={form.scopeOfWork}
            onChange={setField('scopeOfWork')}
            rows={3}
            placeholder="What is included in this engagement..."
            className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-800 dark:text-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none placeholder:text-gray-400"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Deliverables
          </label>
          <textarea
            value={form.deliverables}
            onChange={setField('deliverables')}
            rows={3}
            placeholder="List each deliverable on a new line..."
            className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-800 dark:text-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none placeholder:text-gray-400"
          />
        </div>
        <Input
          label="Payment Structure"
          value={form.paymentStructure}
          onChange={setField('paymentStructure')}
          placeholder="e.g. 50% deposit, 50% on delivery"
        />
        <Input
          label="Timeline / Deadline"
          value={form.timeline}
          onChange={setField('timeline')}
          placeholder="e.g. 4 weeks from deposit"
        />
        <div className="flex justify-end pt-1">
          <Button size="sm" loading={isSaving} onClick={handleSave}>
            Save Summary
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Document Manager ─────────────────────────────────────────────────────────

function DocumentManager({ workspace, onUpload, onDelete, isUploading }) {
  const fileInputRef = useRef(null)
  const [category, setCategory] = useState('OTHER')
  const [notes, setNotes] = useState('')
  const [activeCategory, setActiveCategory] = useState('ALL')

  const documents = workspace.documents || []
  const filtered =
    activeCategory === 'ALL'
      ? documents
      : documents.filter((d) => d.category === activeCategory)

  const categoryGroups = ['ALL', ...new Set(documents.map((d) => d.category))]

  const handleFileChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const formData = new FormData()
    formData.append('file', file)
    formData.append('category', category)
    if (notes) formData.append('notes', notes)
    onUpload(formData)
    e.target.value = ''
    setNotes('')
  }

  const formatFileSize = (bytes) => {
    if (!bytes) return ''
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Documents & Files</h3>
        <span className="text-xs text-gray-400">{documents.length} file{documents.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Upload area */}
      <div
        onClick={() => fileInputRef.current?.click()}
        className="border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg p-4 text-center cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/30 transition-all mb-4 group"
      >
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.gif,.txt"
          onChange={handleFileChange}
        />
        {isUploading ? (
          <div className="flex items-center justify-center gap-2 text-indigo-500">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Uploading…</span>
          </div>
        ) : (
          <>
            <Upload className="h-6 w-6 text-gray-300 group-hover:text-indigo-400 mx-auto mb-1 transition-colors" />
            <p className="text-xs text-gray-400 group-hover:text-indigo-500 transition-colors">
              Click to upload a file
            </p>
            <p className="text-xs text-gray-300 mt-0.5">PDF, Word, PNG, JPG, TXT — max 20 MB</p>
          </>
        )}
      </div>

      {/* Category + note for next upload */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        <Select
          label="Category"
          options={DOC_CATEGORY_OPTIONS}
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        />
        <Input
          label="File Note (optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Version 2, final"
        />
      </div>

      {/* Category filter tabs */}
      {categoryGroups.length > 1 && (
        <div className="flex gap-1 flex-wrap mb-3">
          {categoryGroups.map((c) => (
            <button
              key={c}
              onClick={() => setActiveCategory(c)}
              className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
                activeCategory === c
                  ? 'bg-indigo-100 text-indigo-700'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {c === 'ALL' ? 'All' : c.charAt(0) + c.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      )}

      {/* File list */}
      <div className="space-y-2 max-h-72 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="text-center text-xs text-gray-400 py-6">No files yet</p>
        ) : (
          filtered.map((doc) => (
            <div
              key={doc.id}
              className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors group"
            >
              <div className="flex-shrink-0 mt-0.5 text-gray-400">
                {DOC_CATEGORY_ICONS[doc.category] || <File className="h-4 w-4" />}
              </div>
              <div className="flex-1 min-w-0">
                <a
                  href={`http://localhost:3001${doc.fileUrl}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-indigo-600 hover:underline truncate block"
                >
                  {doc.name}
                </a>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-gray-400">
                    {doc.category.charAt(0) + doc.category.slice(1).toLowerCase()}
                  </span>
                  {doc.fileSize && (
                    <span className="text-xs text-gray-300">· {formatFileSize(doc.fileSize)}</span>
                  )}
                  <span className="text-xs text-gray-300">· {formatDate(doc.createdAt)}</span>
                </div>
                {doc.notes && (
                  <p className="text-xs text-gray-400 mt-0.5 italic">{doc.notes}</p>
                )}
              </div>
              <button
                onClick={() => onDelete(doc.id)}
                className="flex-shrink-0 opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition-all"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// ─── Payment Tracker ──────────────────────────────────────────────────────────

function PaymentTracker({ workspace, onCreate, onUpdate, onDelete }) {
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ type: 'DEPOSIT', amount: '', dueDate: '', description: '' })
  const setField = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }))

  const payments = workspace.payments || []
  const totalAgreed = payments.reduce((sum, p) => sum + p.amount, 0)
  const totalPaid = payments
    .filter((p) => p.status === 'PAID')
    .reduce((sum, p) => sum + p.amount, 0)
  const remaining = totalAgreed - totalPaid
  const paidPct = totalAgreed > 0 ? Math.round((totalPaid / totalAgreed) * 100) : 0

  const handleCreate = () => {
    if (!form.amount) return toast.error('Enter an amount')
    onCreate({ ...form, amount: parseFloat(form.amount) })
    setForm({ type: 'DEPOSIT', amount: '', dueDate: '', description: '' })
    setShowForm(false)
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Payment Tracking</h3>
        <Button size="xs" variant="secondary" onClick={() => setShowForm((s) => !s)}>
          <Plus className="h-3.5 w-3.5" /> Add
        </Button>
      </div>

      {/* Summary bar */}
      {payments.length > 0 && (
        <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>Paid {formatCurrency(totalPaid)} of {formatCurrency(totalAgreed)}</span>
            <span className={remaining > 0 ? 'text-amber-600 font-semibold' : 'text-green-600 font-semibold'}>
              {remaining > 0 ? `${formatCurrency(remaining)} remaining` : 'Fully paid ✓'}
            </span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 overflow-hidden">
            <div
              className="h-1.5 rounded-full bg-indigo-500 transition-all duration-500"
              style={{ width: `${paidPct}%` }}
            />
          </div>
          <p className="text-xs text-gray-400 mt-1">{paidPct}% collected</p>
        </div>
      )}

      {/* Add payment form */}
      {showForm && (
        <div className="mb-4 p-3 border border-indigo-100 rounded-lg bg-indigo-50/30 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Select
              label="Type"
              options={PAYMENT_TYPE_OPTIONS}
              value={form.type}
              onChange={setField('type')}
            />
            <Input
              label="Amount ($)"
              type="number"
              min="0"
              step="0.01"
              value={form.amount}
              onChange={setField('amount')}
              placeholder="0.00"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input
              label="Due Date (optional)"
              type="date"
              value={form.dueDate}
              onChange={setField('dueDate')}
            />
            <Input
              label="Description"
              value={form.description}
              onChange={setField('description')}
              placeholder="e.g. 50% deposit"
            />
          </div>
          <div className="flex gap-2 justify-end pt-1">
            <Button size="xs" variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button size="xs" onClick={handleCreate}>Add Payment</Button>
          </div>
        </div>
      )}

      {/* Payment list */}
      <div className="space-y-2">
        {payments.length === 0 ? (
          <p className="text-center text-xs text-gray-400 py-6">No payments yet — add a deposit or installment</p>
        ) : (
          payments.map((p) => (
            <PaymentRow key={p.id} payment={p} onUpdate={onUpdate} onDelete={onDelete} />
          ))
        )}
      </div>
    </div>
  )
}

function PaymentRow({ payment, onUpdate, onDelete }) {
  const [editing, setEditing] = useState(false)
  const [status, setStatus] = useState(payment.status)

  const handleStatusChange = (newStatus) => {
    setStatus(newStatus)
    onUpdate(payment.id, {
      status: newStatus,
      ...(newStatus === 'PAID' ? { paidAt: new Date().toISOString() } : {}),
    })
  }

  const typeLabel = PAYMENT_TYPE_OPTIONS.find((t) => t.value === payment.type)?.label ?? payment.type

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors group">
      {/* Status indicator */}
      <div
        className={`flex-shrink-0 w-2 h-2 rounded-full ${
          status === 'PAID' ? 'bg-green-500'
          : status === 'OVERDUE' ? 'bg-red-500'
          : status === 'PARTIAL' ? 'bg-amber-500'
          : 'bg-gray-300'
        }`}
      />

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
            {formatCurrency(payment.amount)}
          </span>
          <span className="text-xs text-gray-400">{typeLabel}</span>
        </div>
        {payment.description && (
          <p className="text-xs text-gray-400 truncate">{payment.description}</p>
        )}
        {payment.dueDate && (
          <p className="text-xs text-gray-400">Due {formatDate(payment.dueDate)}</p>
        )}
        {payment.paidAt && (
          <p className="text-xs text-green-600">Paid {formatDate(payment.paidAt)}</p>
        )}
      </div>

      {/* Status badge + quick actions */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PAYMENT_STATUS_STYLES[status]}`}>
          {status.charAt(0) + status.slice(1).toLowerCase()}
        </span>
        {status !== 'PAID' && (
          <button
            onClick={() => handleStatusChange('PAID')}
            title="Mark as paid"
            className="opacity-0 group-hover:opacity-100 text-green-500 hover:text-green-700 transition-all"
          >
            <Check className="h-4 w-4" />
          </button>
        )}
        <button
          onClick={() => onDelete(payment.id)}
          className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition-all"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

// ─── Notes Panel ─────────────────────────────────────────────────────────────

function NotesPanel({ workspace, onSave, isSaving }) {
  const [notes, setNotes] = useState(workspace.notes || '')

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-5">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Context & Notes</h3>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={5}
        placeholder="What was promised, client expectations, key decisions, special requirements..."
        className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-800 dark:text-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none placeholder:text-gray-400"
      />
      <div className="flex justify-end mt-2">
        <Button size="sm" variant="secondary" loading={isSaving} onClick={() => onSave(notes)}>
          Save Notes
        </Button>
      </div>
    </div>
  )
}

// ─── Main DealWorkspace component ────────────────────────────────────────────

export default function DealWorkspace({ leadId }) {
  const queryClient = useQueryClient()
  const [activeSection, setActiveSection] = useState('progress')

  const { data: res, isLoading, isError } = useQuery({
    queryKey: ['workspace', leadId],
    queryFn: () => workspaceApi.getByLead(leadId).then((r) => r.data.data),
    retry: 0,
    staleTime: 30_000,
  })

  const workspace = res

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['workspace', leadId] })

  // Stage mutation
  const stageMutation = useMutation({
    mutationFn: (stage) => workspaceApi.updateStage(workspace.id, stage),
    onSuccess: () => { invalidate(); toast.success('Stage updated') },
    onError: (err) => toast.error(err.response?.data?.error || 'Stage update failed'),
  })

  // Notes mutation
  const notesMutation = useMutation({
    mutationFn: (notes) => workspaceApi.updateNotes(workspace.id, notes),
    onSuccess: () => { invalidate(); toast.success('Notes saved') },
    onError: (err) => toast.error(err.response?.data?.error || 'Save failed'),
  })

  // Summary mutation
  const summaryMutation = useMutation({
    mutationFn: (data) => workspaceApi.upsertSummary(workspace.id, data),
    onSuccess: () => { invalidate(); toast.success('Summary saved') },
    onError: (err) => toast.error(err.response?.data?.error || 'Save failed'),
  })

  // Document mutations
  const uploadMutation = useMutation({
    mutationFn: (formData) => workspaceApi.uploadDocument(workspace.id, formData),
    onSuccess: () => { invalidate(); toast.success('File uploaded') },
    onError: (err) => toast.error(err.response?.data?.error || 'Upload failed'),
  })

  const deleteDocMutation = useMutation({
    mutationFn: (docId) => workspaceApi.deleteDocument(workspace.id, docId),
    onSuccess: () => { invalidate(); toast.success('File removed') },
    onError: (err) => toast.error(err.response?.data?.error || 'Delete failed'),
  })

  // Payment mutations
  const createPaymentMutation = useMutation({
    mutationFn: (data) => workspaceApi.createPayment(workspace.id, data),
    onSuccess: () => { invalidate(); toast.success('Payment added') },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed to add payment'),
  })

  const updatePaymentMutation = useMutation({
    mutationFn: ({ paymentId, data }) => workspaceApi.updatePayment(workspace.id, paymentId, data),
    onSuccess: () => { invalidate() },
    onError: (err) => toast.error(err.response?.data?.error || 'Update failed'),
  })

  const deletePaymentMutation = useMutation({
    mutationFn: (paymentId) => workspaceApi.deletePayment(workspace.id, paymentId),
    onSuccess: () => { invalidate(); toast.success('Payment removed') },
    onError: (err) => toast.error(err.response?.data?.error || 'Delete failed'),
  })

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-16">
        <Spinner size="lg" />
      </div>
    )
  }

  if (isError || !workspace) {
    return (
      <div className="flex flex-col items-center py-12 gap-3 text-center">
        <AlertCircle className="h-8 w-8 text-red-400" />
        <p className="text-sm text-gray-500">Could not load deal workspace</p>
        <Button size="sm" variant="secondary" onClick={() => queryClient.invalidateQueries({ queryKey: ['workspace', leadId] })}>
          Retry
        </Button>
      </div>
    )
  }

  const SECTIONS = [
    { key: 'progress', label: 'Progress', icon: <CheckCircle2 className="h-4 w-4" /> },
    { key: 'summary',  label: 'Deal Summary', icon: <FileText className="h-4 w-4" /> },
    { key: 'documents', label: 'Documents', icon: <Paperclip className="h-4 w-4" />, count: workspace.documents?.length },
    { key: 'payments', label: 'Payments', icon: <DollarSign className="h-4 w-4" />, count: workspace.payments?.length },
    { key: 'notes',    label: 'Notes', icon: <Edit2 className="h-4 w-4" /> },
  ]

  return (
    <div className="space-y-5">
      {/* Header strip */}
      <div className="flex items-center justify-between bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 rounded-xl p-4 border border-indigo-100 dark:border-indigo-800">
        <div>
          <h2 className="text-sm font-bold text-gray-800 dark:text-gray-100">Deal Workspace</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Current stage: <span className="font-semibold text-indigo-600">{STAGE_LABELS[workspace.currentStage]}</span>
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <span className="font-medium">{workspace.documents?.length ?? 0}</span> files ·
          <span className="font-medium">{workspace.payments?.length ?? 0}</span> payments
        </div>
      </div>

      {/* Section nav */}
      <div className="flex gap-1 flex-wrap">
        {SECTIONS.map((s) => (
          <button
            key={s.key}
            onClick={() => setActiveSection(s.key)}
            className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
              activeSection === s.key
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            {s.icon}
            {s.label}
            {s.count > 0 && (
              <span className={`ml-0.5 rounded-full px-1.5 text-xs font-bold ${
                activeSection === s.key ? 'bg-indigo-400 text-white' : 'bg-gray-200 text-gray-600'
              }`}>
                {s.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Section content */}
      {activeSection === 'progress' && (
        <ProgressTracker
          workspace={workspace}
          onStageChange={(stage) => stageMutation.mutate(stage)}
          isUpdatingStage={stageMutation.isPending}
        />
      )}

      {activeSection === 'summary' && (
        <DealSummaryPanel
          workspace={workspace}
          onSave={(data) => summaryMutation.mutate(data)}
          isSaving={summaryMutation.isPending}
        />
      )}

      {activeSection === 'documents' && (
        <DocumentManager
          workspace={workspace}
          onUpload={(formData) => uploadMutation.mutate(formData)}
          onDelete={(docId) => deleteDocMutation.mutate(docId)}
          isUploading={uploadMutation.isPending}
        />
      )}

      {activeSection === 'payments' && (
        <PaymentTracker
          workspace={workspace}
          onCreate={(data) => createPaymentMutation.mutate(data)}
          onUpdate={(paymentId, data) => updatePaymentMutation.mutate({ paymentId, data })}
          onDelete={(paymentId) => deletePaymentMutation.mutate(paymentId)}
        />
      )}

      {activeSection === 'notes' && (
        <NotesPanel
          workspace={workspace}
          onSave={(notes) => notesMutation.mutate(notes)}
          isSaving={notesMutation.isPending}
        />
      )}
    </div>
  )
}
