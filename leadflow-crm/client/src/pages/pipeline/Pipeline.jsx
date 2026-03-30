import { useState, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd'
import {
  Plus, Clock, ChevronDown, Layers, Trash2, Star, Filter, X,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { pipelineApi } from '../../api/pipeline.api'
import { pipelinesApi } from '../../api/pipelines.api'
import { leadsApi } from '../../api/leads.api'
import { formatCurrency, getInitials } from '../../utils/format'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Modal from '../../components/ui/Modal'
import Spinner from '../../components/ui/Spinner'

// ---------------------------------------------------------------------------
// Color palette — light and dark variants per stage colour
// ---------------------------------------------------------------------------
const STAGE_COLOR_STYLES = {
  blue:   { header: 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-700',     accent: 'text-blue-600 dark:text-blue-400',   dot: 'bg-blue-500',   bar: 'bg-blue-400'   },
  indigo: { header: 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-200 dark:border-indigo-700', accent: 'text-indigo-600 dark:text-indigo-400', dot: 'bg-indigo-500', bar: 'bg-indigo-400' },
  purple: { header: 'bg-purple-50 dark:bg-purple-900/30 border-purple-200 dark:border-purple-700', accent: 'text-purple-600 dark:text-purple-400', dot: 'bg-purple-500', bar: 'bg-purple-400' },
  amber:  { header: 'bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-700',   accent: 'text-amber-600 dark:text-amber-400',  dot: 'bg-amber-500',  bar: 'bg-amber-400'  },
  orange: { header: 'bg-orange-50 dark:bg-orange-900/30 border-orange-200 dark:border-orange-700', accent: 'text-orange-600 dark:text-orange-400', dot: 'bg-orange-500', bar: 'bg-orange-400' },
  yellow: { header: 'bg-yellow-50 dark:bg-yellow-900/30 border-yellow-200 dark:border-yellow-700', accent: 'text-yellow-600 dark:text-yellow-400', dot: 'bg-yellow-500', bar: 'bg-yellow-400' },
  teal:   { header: 'bg-teal-50 dark:bg-teal-900/30 border-teal-200 dark:border-teal-700',     accent: 'text-teal-600 dark:text-teal-400',   dot: 'bg-teal-500',   bar: 'bg-teal-400'   },
  green:  { header: 'bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-700',   accent: 'text-green-600 dark:text-green-400',  dot: 'bg-green-500',  bar: 'bg-green-400'  },
  red:    { header: 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-700',       accent: 'text-red-600 dark:text-red-400',    dot: 'bg-red-500',    bar: 'bg-red-400'    },
}
const DEFAULT_STAGE_STYLE = STAGE_COLOR_STYLES.blue

function stageStyle(color) {
  return STAGE_COLOR_STYLES[color] || DEFAULT_STAGE_STYLE
}

// ---------------------------------------------------------------------------
// Template metadata (emoji + label for picker)
// ---------------------------------------------------------------------------
const TEMPLATE_META = {
  STANDARD:         { emoji: '📊', label: 'Standard Sales' },
  CONTENT_DOWNLOAD: { emoji: '📥', label: 'Content Download' },
  EVENT_WEBINAR:    { emoji: '🎤', label: 'Event / Webinar' },
  FREE_TRIAL:       { emoji: '🧪', label: 'Free Trial' },
  SOURCE_BASED:     { emoji: '📡', label: 'Source-Based' },
}

const LEAD_SOURCES = [
  { value: '', label: 'All Sources' },
  { value: 'MANUAL', label: 'Manual' },
  { value: 'WEBSITE', label: 'Website' },
  { value: 'REFERRAL', label: 'Referral' },
  { value: 'COLD_OUTREACH', label: 'Cold Outreach' },
  { value: 'SOCIAL_MEDIA', label: 'Social Media' },
  { value: 'EVENT', label: 'Event' },
  { value: 'CSV', label: 'CSV Import' },
  { value: 'OTHER', label: 'Other' },
]

// ---------------------------------------------------------------------------
// CreatePipelineModal  — single-screen: pick template + optional name → create
// ---------------------------------------------------------------------------
function CreatePipelineModal({ isOpen, onClose }) {
  const queryClient = useQueryClient()
  const [selectedType, setSelectedType] = useState(null)
  const [name, setName] = useState('')

  // Shared with the prefetch in Pipeline — hits cache immediately on open
  const { data: templatesRes, isLoading: templatesLoading } = useQuery({
    queryKey: ['pipeline-templates'],
    queryFn: () => pipelinesApi.getTemplates(),
    staleTime: Infinity,
  })
  const templates = templatesRes?.data?.data ?? []

  const mutation = useMutation({
    mutationFn: (data) => pipelinesApi.createPipeline(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipelines'] })
      queryClient.invalidateQueries({ queryKey: ['pipeline'] })
      toast.success('Pipeline created!')
      handleClose()
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed to create pipeline'),
  })

  const handleCreate = () => {
    if (!selectedType) { toast.error('Select a template first'); return }
    mutation.mutate({ type: selectedType.type, name: name.trim() || selectedType.name })
  }

  const handleClose = () => {
    onClose()
    setSelectedType(null)
    setName('')
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="New Pipeline" size="lg">
      <div className="space-y-4">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Choose a template — stages are pre-configured and can be renamed.
        </p>

        {/* Template picker */}
        {templatesLoading ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : (
          <div className="grid grid-cols-1 gap-3 max-h-[320px] overflow-y-auto pr-1">
            {templates.map((tmpl) => {
              const meta = TEMPLATE_META[tmpl.type] || { emoji: '📋', label: tmpl.name }
              const isSelected = selectedType?.type === tmpl.type
              return (
                <button
                  key={tmpl.type}
                  type="button"
                  onClick={() => setSelectedType(tmpl)}
                  className={`w-full text-left rounded-xl border-2 p-4 transition-all ${
                    isSelected
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30'
                      : 'border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-600 hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-2xl leading-none">{meta.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-800 dark:text-gray-100 text-sm">{tmpl.name}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{tmpl.description}</p>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {(tmpl.stages || []).map((s) => (
                          <span
                            key={s.key}
                            className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                              s.isWon  ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400' :
                              s.isLost ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400' :
                                         'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                            }`}
                          >
                            {s.label}
                          </span>
                        ))}
                      </div>
                    </div>
                    {isSelected && (
                      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-indigo-500 flex items-center justify-center">
                        <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      </span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        )}

        {/* Optional name — only shows after a template is selected */}
        {selectedType && (
          <Input
            label={`Pipeline name (default: "${selectedType.name}")`}
            placeholder={selectedType.name}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-2 border-t border-gray-100 dark:border-gray-800">
          <Button variant="secondary" onClick={handleClose}>Cancel</Button>
          <Button onClick={handleCreate} disabled={!selectedType} loading={mutation.isPending}>
            Create Pipeline
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// CreateDealModal
// ---------------------------------------------------------------------------
function CreateDealModal({ isOpen, onClose, activePipeline, defaultStageKey }) {
  const queryClient = useQueryClient()
  const [leadSearch, setLeadSearch] = useState('')
  const [selectedLead, setSelectedLead] = useState(null)
  const [showLeadDropdown, setShowLeadDropdown] = useState(false)

  const pipelineStages = useMemo(
    () => (activePipeline?.stages ? [...activePipeline.stages].sort((a, b) => a.order - b.order) : []),
    [activePipeline]
  )
  const firstStageKey = pipelineStages[0]?.key || ''

  const [form, setForm] = useState({ stage: '', value: '', probability: 10 })

  // Sync stage when the modal opens for a specific column or when pipeline loads
  useEffect(() => {
    const stage = defaultStageKey || firstStageKey
    if (stage) setForm((prev) => ({ ...prev, stage }))
  }, [defaultStageKey, firstStageKey])

  const { data: leadsData } = useQuery({
    queryKey: ['leads-search', leadSearch],
    queryFn: () => leadsApi.getLeads({ search: leadSearch, limit: 8 }).then((r) => r.data),
    enabled: leadSearch.length > 1,
  })
  const leads = leadsData?.data ?? []

  const mutation = useMutation({
    mutationFn: (data) => pipelineApi.createDeal(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipeline'] })
      queryClient.invalidateQueries({ queryKey: ['pipelines'] })
      toast.success('Deal added!')
      onClose()
      setSelectedLead(null)
      setLeadSearch('')
      setForm({ stage: firstStageKey, value: '', probability: 10 })
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed to add deal'),
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!selectedLead) { toast.error('Please select a lead'); return }
    if (!form.stage) { toast.error('Select a stage'); return }
    mutation.mutate({
      leadId: selectedLead.id,
      pipelineId: activePipeline?.id,
      stage: form.stage,
      value: parseFloat(form.value) || 0,
      probability: parseInt(form.probability, 10),
    })
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add Deal" size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Lead search */}
        <div className="relative">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Lead *</label>
          <input
            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500"
            placeholder="Search lead name..."
            value={selectedLead ? `${selectedLead.firstName} ${selectedLead.lastName}` : leadSearch}
            onChange={(e) => { setLeadSearch(e.target.value); setSelectedLead(null); setShowLeadDropdown(true) }}
            onFocus={() => setShowLeadDropdown(true)}
          />
          {showLeadDropdown && leads.length > 0 && !selectedLead && (
            <div className="absolute top-full left-0 right-0 z-20 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg mt-1 max-h-48 overflow-y-auto">
              {leads.map((lead) => (
                <button
                  key={lead.id}
                  type="button"
                  className="w-full px-3 py-2.5 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2"
                  onClick={() => { setSelectedLead(lead); setShowLeadDropdown(false) }}
                >
                  <div className="w-7 h-7 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-xs font-bold text-indigo-700 dark:text-indigo-300">
                    {getInitials(lead.firstName, lead.lastName)}
                  </div>
                  <div>
                    <p className="font-medium text-gray-800 dark:text-gray-100">{lead.firstName} {lead.lastName}</p>
                    {lead.company && <p className="text-xs text-gray-400 dark:text-gray-500">{lead.company}</p>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Stage */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Stage</label>
          <select
            value={form.stage}
            onChange={(e) => setForm((prev) => ({ ...prev, stage: e.target.value }))}
            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-200"
          >
            {pipelineStages.length === 0 && <option value="">Loading stages…</option>}
            {pipelineStages.map((s) => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
        </div>

        <Input
          label="Deal Value ($)"
          type="number" min="0" step="0.01"
          value={form.value}
          onChange={(e) => setForm((prev) => ({ ...prev, value: e.target.value }))}
          placeholder="5000"
        />

        {/* Probability slider */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Probability: <span className="text-indigo-600 dark:text-indigo-400 font-semibold">{form.probability}%</span>
          </label>
          <input
            type="range" min="0" max="100"
            value={form.probability}
            onChange={(e) => setForm((prev) => ({ ...prev, probability: e.target.value }))}
            className="w-full accent-indigo-600"
          />
          <div className="flex justify-between text-xs text-gray-400 mt-0.5">
            <span>0%</span><span>50%</span><span>100%</span>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={mutation.isPending}>Add Deal</Button>
        </div>
      </form>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// DealCard
// ---------------------------------------------------------------------------
function DealCard({ deal, index, stageConfig }) {
  const styles = stageStyle(stageConfig?.color)
  const daysInStage = Math.floor((Date.now() - new Date(deal.updatedAt).getTime()) / (1000 * 60 * 60 * 24))

  return (
    <Draggable draggableId={deal.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          className={`bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3 shadow-sm transition-shadow ${
            snapshot.isDragging ? 'shadow-lg ring-2 ring-indigo-300 dark:ring-indigo-600' : 'hover:shadow-md'
          }`}
        >
          {/* Lead info */}
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-xs font-bold text-indigo-700 dark:text-indigo-300 flex-shrink-0">
              {getInitials(deal.lead?.firstName, deal.lead?.lastName)}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">
                {deal.lead?.firstName} {deal.lead?.lastName}
              </p>
              {deal.lead?.company && (
                <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{deal.lead.company}</p>
              )}
            </div>
          </div>

          {/* Value */}
          <p className="text-base font-bold text-gray-900 dark:text-gray-100 mb-2">{formatCurrency(deal.value)}</p>

          {/* Probability bar */}
          <div className="mb-2">
            <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-0.5">
              <span>Probability</span>
              <span>{deal.probability}%</span>
            </div>
            <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${styles.bar}`} style={{ width: `${deal.probability}%` }} />
            </div>
          </div>

          {/* Footer: source tag + age */}
          <div className="flex items-center justify-between mt-2">
            {deal.lead?.source && deal.lead.source !== 'MANUAL' && (
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
                {deal.lead.source.replace(/_/g, ' ')}
              </span>
            )}
            {daysInStage >= 1 && (
              <span className={`ml-auto flex items-center gap-1 text-[10px] font-medium ${daysInStage >= 14 ? 'text-red-500' : 'text-gray-400 dark:text-gray-500'}`}>
                <Clock className="h-2.5 w-2.5" />
                {daysInStage}d
              </span>
            )}
          </div>
        </div>
      )}
    </Draggable>
  )
}

// ---------------------------------------------------------------------------
// Main Pipeline page
// ---------------------------------------------------------------------------
export default function Pipeline() {
  const queryClient = useQueryClient()

  const [activePipelineId, setActivePipelineId] = useState(null)
  const [createPipelineOpen, setCreatePipelineOpen] = useState(false)
  const [createDealOpen, setCreateDealOpen] = useState(false)
  const [createDealStage, setCreateDealStage] = useState(null)
  const [sourceFilter, setSourceFilter] = useState('')

  // Prefetch templates now so the "New Pipeline" modal opens instantly (no spinner)
  useQuery({
    queryKey: ['pipeline-templates'],
    queryFn: () => pipelinesApi.getTemplates(),
    staleTime: Infinity,
  })

  // ── Pipeline list (tabs) ──────────────────────────────────────────────────
  const { data: pipelinesRes, isLoading: pipelinesLoading } = useQuery({
    queryKey: ['pipelines'],
    queryFn: () => pipelinesApi.getPipelines(),
    staleTime: 60_000,
  })
  const pipelines = pipelinesRes?.data?.data ?? []

  const resolvedPipelineId = useMemo(() => {
    if (activePipelineId) return activePipelineId
    const def = pipelines.find((p) => p.isDefault) || pipelines[0]
    return def?.id || null
  }, [activePipelineId, pipelines])

  // ── Board data ────────────────────────────────────────────────────────────
  // Only fetch once we have a real pipeline ID — avoids the double-fetch that
  // happened when fetching with undefined → auto-create → pipelines refetch → fetch again.
  const { data: boardData, isLoading: boardLoading } = useQuery({
    queryKey: ['pipeline', resolvedPipelineId, sourceFilter],
    queryFn: () =>
      pipelineApi.getPipeline({
        pipelineId: resolvedPipelineId,
        source: sourceFilter || undefined,
      }),
    enabled: !pipelinesLoading && !!resolvedPipelineId,
    staleTime: 30_000,
  })

  const activePipeline = boardData?.data?.data?.pipeline || null
  const stages = boardData?.data?.data?.stages || []
  const columns = boardData?.data?.data?.columns || {}

  // ── Mutations ─────────────────────────────────────────────────────────────
  const updateMutation = useMutation({
    mutationFn: ({ id, stage }) => pipelineApi.updateDeal(id, { stage }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipeline'] })
      queryClient.invalidateQueries({ queryKey: ['pipelines'] })
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed to move deal'),
  })

  const deletePipelineMutation = useMutation({
    mutationFn: (id) => pipelinesApi.deletePipeline(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipelines'] })
      queryClient.invalidateQueries({ queryKey: ['pipeline'] })
      setActivePipelineId(null)
      toast.success('Pipeline deleted')
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed to delete pipeline'),
  })

  const setDefaultMutation = useMutation({
    mutationFn: (id) => pipelinesApi.setDefault(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipelines'] })
      toast.success('Default pipeline updated')
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed to update default'),
  })

  // ── Drag & drop ───────────────────────────────────────────────────────────
  const onDragEnd = (result) => {
    const { draggableId, source, destination } = result
    if (!destination) return
    if (source.droppableId === destination.droppableId && source.index === destination.index) return

    const destStageKey = destination.droppableId
    updateMutation.mutate({ id: draggableId, stage: destStageKey })

    // Optimistic update — keep board responsive
    queryClient.setQueryData(['pipeline', resolvedPipelineId, sourceFilter], (old) => {
      if (!old) return old
      const oldCols = old.data?.data?.columns || {}
      const deal = (oldCols[source.droppableId] || []).find((d) => d.id === draggableId)
      if (!deal) return old
      const updatedDeal = { ...deal, stage: destStageKey }
      const newCols = {
        ...oldCols,
        [source.droppableId]: (oldCols[source.droppableId] || []).filter((d) => d.id !== draggableId),
        [destStageKey]: [
          ...(oldCols[destStageKey] || []).slice(0, destination.index),
          updatedDeal,
          ...(oldCols[destStageKey] || []).slice(destination.index),
        ],
      }
      return { ...old, data: { ...old.data, data: { ...old.data.data, columns: newCols } } }
    })
  }

  // ── Totals ────────────────────────────────────────────────────────────────
  const totalValue = useMemo(
    () => stages.flatMap((s) => columns[s.key] || []).reduce((sum, d) => sum + (d.value || 0), 0),
    [stages, columns]
  )

  if (pipelinesLoading) {
    return <div className="flex justify-center items-center h-64"><Spinner size="lg" /></div>
  }

  return (
    <div className="p-6 space-y-4">
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Pipeline</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Total pipeline value:{' '}
            <span className="font-semibold text-gray-800 dark:text-gray-200">{formatCurrency(totalValue)}</span>
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Source filter */}
          <div className="relative">
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="appearance-none pl-8 pr-8 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-200 cursor-pointer"
            >
              {LEAD_SOURCES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
            <Filter className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
            <ChevronDown className="absolute right-2 top-2.5 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
          </div>

          {sourceFilter && (
            <button
              onClick={() => setSourceFilter('')}
              className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700"
              title="Clear filter"
            >
              <X className="h-4 w-4" />
            </button>
          )}

          <Button onClick={() => setCreateDealOpen(true)} size="sm">
            <Plus className="h-4 w-4 mr-1" /> Add Deal
          </Button>
        </div>
      </div>

      {/* ── Pipeline tabs ── */}
      <div className="flex items-center gap-1 border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
        {pipelines.map((p) => {
          const isActive = p.id === (resolvedPipelineId || pipelines[0]?.id)
          const meta = TEMPLATE_META[p.type] || { emoji: '📋', label: p.name }
          return (
            <div key={p.id} className="relative group flex-shrink-0">
              <button
                onClick={() => setActivePipelineId(p.id)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  isActive
                    ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                <span className="text-base leading-none">{meta.emoji}</span>
                <span>{p.name}</span>
                {p.isDefault && <Star className="h-3 w-3 text-amber-400 fill-amber-400" />}
                <span className="ml-1 text-xs text-gray-400 bg-gray-100 dark:bg-gray-700 dark:text-gray-400 rounded-full px-1.5 py-0.5">
                  {p._count?.deals ?? 0}
                </span>
              </button>

              {/* Hover actions (only when active and there are other pipelines) */}
              {isActive && pipelines.length > 1 && (
                <div className="absolute top-full right-0 z-10 hidden group-hover:flex items-center gap-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-md p-1 mt-0.5">
                  {!p.isDefault && (
                    <button
                      title="Set as default"
                      onClick={() => setDefaultMutation.mutate(p.id)}
                      className="p-1.5 rounded hover:bg-amber-50 dark:hover:bg-amber-900/30 text-gray-400 hover:text-amber-500"
                    >
                      <Star className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button
                    title="Delete pipeline"
                    onClick={() => {
                      if (window.confirm(`Delete "${p.name}"? Deals in this pipeline will be unlinked.`)) {
                        deletePipelineMutation.mutate(p.id)
                      }
                    }}
                    className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-500"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          )
        })}

        <button
          onClick={() => setCreatePipelineOpen(true)}
          className="flex items-center gap-1 px-3 py-2.5 text-sm text-gray-400 dark:text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-t-lg transition-colors flex-shrink-0 border-b-2 border-transparent"
          title="New pipeline"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">New Pipeline</span>
        </button>
      </div>

      {/* ── Kanban board ── */}
      {boardLoading ? (
        <div className="flex justify-center items-center h-64"><Spinner size="lg" /></div>
      ) : stages.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <Layers className="h-10 w-10 text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-gray-500 dark:text-gray-400 font-medium">No pipeline stages configured</p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">Create a new pipeline to get started</p>
          <Button className="mt-4" onClick={() => setCreatePipelineOpen(true)}>
            <Layers className="h-4 w-4 mr-2" /> Create Pipeline
          </Button>
        </div>
      ) : (
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="flex gap-4 overflow-x-auto pb-4">
            {stages.map((stage) => {
              const stageDeals = columns[stage.key] || []
              const stageTotal = stageDeals.reduce((sum, d) => sum + (d.value || 0), 0)
              const styles = stageStyle(stage.color)

              return (
                <div key={stage.key} className="flex-shrink-0 w-72">
                  {/* Column header */}
                  <div className={`flex items-center justify-between px-3 py-2.5 rounded-t-lg border ${styles.header}`}>
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${styles.dot}`} />
                      <span className={`text-sm font-semibold ${styles.accent}`}>{stage.label}</span>
                      <span className="text-xs bg-white/70 dark:bg-black/20 text-gray-600 dark:text-gray-300 rounded-full px-1.5 py-0.5 font-medium">
                        {stageDeals.length}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">{formatCurrency(stageTotal)}</span>
                      <button
                        className={`ml-1 p-0.5 rounded hover:bg-white/80 dark:hover:bg-black/20 transition-colors ${styles.accent}`}
                        onClick={() => { setCreateDealStage(stage.key); setCreateDealOpen(true) }}
                        title={`Add deal to ${stage.label}`}
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {/* Droppable area */}
                  <Droppable droppableId={stage.key}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={`min-h-32 p-2 rounded-b-lg border-x border-b border-gray-200 dark:border-gray-700 space-y-2 transition-colors ${
                          snapshot.isDraggingOver
                            ? 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-700'
                            : 'bg-gray-50 dark:bg-gray-900/50'
                        }`}
                      >
                        {stageDeals.length === 0 && !snapshot.isDraggingOver && (
                          <div className="flex items-center justify-center h-24 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg">
                            <p className="text-xs text-gray-400 dark:text-gray-600">Drop deals here</p>
                          </div>
                        )}
                        {stageDeals.map((deal, index) => (
                          <DealCard key={deal.id} deal={deal} index={index} stageConfig={stage} />
                        ))}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </div>
              )
            })}
          </div>
        </DragDropContext>
      )}

      {/* ── Modals ── */}
      <CreatePipelineModal
        isOpen={createPipelineOpen}
        onClose={() => setCreatePipelineOpen(false)}
      />
      <CreateDealModal
        isOpen={createDealOpen}
        onClose={() => { setCreateDealOpen(false); setCreateDealStage(null) }}
        activePipeline={activePipeline}
        defaultStageKey={createDealStage}
      />
    </div>
  )
}
