import { useState, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  Plus, Filter, Users, Trash2, Edit2, ChevronRight,
  Layers, Search,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { segmentsApi } from '../../api/segments.api'
import Modal from '../../components/ui/Modal'
import Input from '../../components/ui/Input'
import Button from '../../components/ui/Button'
import Badge from '../../components/ui/Badge'

const STATUS_OPTIONS = ['COLD', 'WARM', 'HOT', 'CUSTOMER']
const SOURCE_OPTIONS = ['MANUAL', 'CSV', 'API', 'WEBSITE', 'REFERRAL', 'COLD_OUTREACH', 'SOCIAL_MEDIA', 'EVENT', 'OTHER']

const STATUS_BADGE_MAP = {
  COLD: 'cold',
  WARM: 'warm',
  HOT: 'hot',
  CUSTOMER: 'customer',
}

/** Debounce helper */
function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

/** Toggle item in array */
function toggle(arr, item) {
  return arr.includes(item) ? arr.filter(x => x !== item) : [...arr, item]
}

function FilterChip({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
        active
          ? 'bg-indigo-600 text-white border-indigo-600'
          : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-indigo-400 dark:hover:border-indigo-500'
      }`}
    >
      {label}
    </button>
  )
}

function SegmentBuilderModal({ initial, onClose, onSave }) {
  const [name, setName] = useState(initial?.name || '')
  const [description, setDescription] = useState(initial?.description || '')
  const [filters, setFilters] = useState(initial?.filters || {
    status: [], source: [], scoreMin: '', scoreMax: '', tags: '',
  })

  const tagsRaw = typeof filters.tags === 'string'
    ? filters.tags
    : (Array.isArray(filters.tags) ? filters.tags.join(', ') : '')

  const debouncedFilters = useDebounce(filters, 500)
  const [preview, setPreview] = useState(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  // Build clean filters for API
  function buildCleanFilters() {
    const clean = {}
    if (filters.status?.length) clean.status = filters.status
    if (filters.source?.length) clean.source = filters.source
    if (filters.scoreMin !== '' && !isNaN(+filters.scoreMin)) clean.scoreMin = +filters.scoreMin
    if (filters.scoreMax !== '' && !isNaN(+filters.scoreMax)) clean.scoreMax = +filters.scoreMax
    const tagList = (typeof filters.tags === 'string' ? filters.tags : '')
      .split(',').map(t => t.trim()).filter(Boolean)
    if (tagList.length) clean.tags = tagList
    return clean
  }

  // Live preview
  useEffect(() => {
    const clean = buildCleanFilters()
    if (!Object.keys(clean).length) { setPreview(null); return }
    setPreviewLoading(true)
    segmentsApi.previewSegment(clean)
      .then(r => setPreview(r.data.data))
      .catch(() => {})
      .finally(() => setPreviewLoading(false))
  }, [JSON.stringify(debouncedFilters)])

  function handleSave() {
    if (!name.trim()) { toast.error('Segment name is required'); return }
    onSave({ name, description, filters: buildCleanFilters() })
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={initial ? 'Edit Segment' : 'Create Segment'}
      size="lg"
    >
      <div className="space-y-5">
        {/* Name + description */}
        <Input
          label="Segment name"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g. Hot SaaS leads"
        />
        <Input
          label="Description (optional)"
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Who this segment captures…"
        />

        <hr className="border-gray-200 dark:border-gray-700" />

        {/* Filter builder */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-3">Filters</p>

          {/* Status chips */}
          <div className="mb-3">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1.5">Status</p>
            <div className="flex flex-wrap gap-1.5">
              {STATUS_OPTIONS.map(s => (
                <FilterChip
                  key={s}
                  label={s}
                  active={(filters.status || []).includes(s)}
                  onClick={() => setFilters(f => ({ ...f, status: toggle(f.status || [], s) }))}
                />
              ))}
            </div>
          </div>

          {/* Source chips */}
          <div className="mb-3">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1.5">Source</p>
            <div className="flex flex-wrap gap-1.5">
              {SOURCE_OPTIONS.map(s => (
                <FilterChip
                  key={s}
                  label={s.replace('_', ' ')}
                  active={(filters.source || []).includes(s)}
                  onClick={() => setFilters(f => ({ ...f, source: toggle(f.source || [], s) }))}
                />
              ))}
            </div>
          </div>

          {/* Score range */}
          <div className="grid grid-cols-2 gap-3 mb-3">
            <Input
              label="Min score"
              type="number"
              min={0} max={100}
              value={filters.scoreMin}
              onChange={e => setFilters(f => ({ ...f, scoreMin: e.target.value }))}
              placeholder="0"
            />
            <Input
              label="Max score"
              type="number"
              min={0} max={100}
              value={filters.scoreMax}
              onChange={e => setFilters(f => ({ ...f, scoreMax: e.target.value }))}
              placeholder="100"
            />
          </div>

          {/* Tags */}
          <Input
            label="Tags (comma-separated)"
            value={tagsRaw}
            onChange={e => setFilters(f => ({ ...f, tags: e.target.value }))}
            placeholder="SaaS, FinTech, 11-50…"
          />
        </div>

        {/* Live preview */}
        {(preview || previewLoading) && (
          <div className="rounded-xl bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/20 p-3">
            {previewLoading ? (
              <p className="text-xs text-indigo-500 animate-pulse">Counting leads…</p>
            ) : (
              <>
                <p className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 mb-2">
                  {preview.count} lead{preview.count !== 1 ? 's' : ''} match these filters
                </p>
                {preview.leads.length > 0 && (
                  <div className="space-y-1">
                    {preview.leads.map(l => (
                      <div key={l.id} className="flex items-center justify-between text-xs text-indigo-600 dark:text-indigo-400">
                        <span>{l.firstName} {l.lastName}{l.company ? ` · ${l.company}` : ''}</span>
                        <Badge variant={STATUS_BADGE_MAP[l.status] || 'default'} size="sm">{l.status}</Badge>
                      </div>
                    ))}
                    {preview.count > 5 && (
                      <p className="text-xs text-indigo-500 dark:text-indigo-400 pt-1">
                        +{preview.count - 5} more leads…
                      </p>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Footer buttons */}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave}>
            {initial ? 'Save changes' : 'Create segment'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

export default function SegmentsList() {
  const queryClient = useQueryClient()
  const [showBuilder, setShowBuilder] = useState(false)
  const [editSegment, setEditSegment] = useState(null)

  const { data: segments = [], isLoading } = useQuery({
    queryKey: ['segments'],
    queryFn: () => segmentsApi.getSegments().then(r => r.data.data),
  })

  const createMutation = useMutation({
    mutationFn: segmentsApi.createSegment,
    onSuccess: () => {
      queryClient.invalidateQueries(['segments'])
      toast.success('Segment created')
      setShowBuilder(false)
    },
    onError: () => toast.error('Failed to create segment'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => segmentsApi.updateSegment(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['segments'])
      toast.success('Segment updated')
      setEditSegment(null)
    },
    onError: () => toast.error('Failed to update segment'),
  })

  const deleteMutation = useMutation({
    mutationFn: segmentsApi.deleteSegment,
    onSuccess: () => {
      queryClient.invalidateQueries(['segments'])
      toast.success('Segment deleted')
    },
    onError: () => toast.error('Failed to delete segment'),
  })

  function handleSave(data) {
    if (editSegment) {
      updateMutation.mutate({ id: editSegment.id, data })
    } else {
      createMutation.mutate(data)
    }
  }

  function handleDelete(seg) {
    if (window.confirm(`Delete segment "${seg.name}"? This cannot be undone.`)) {
      deleteMutation.mutate(seg.id)
    }
  }

  function summarizeFilters(filters) {
    const parts = []
    if (filters.status?.length) parts.push(`Status: ${filters.status.join(', ')}`)
    if (filters.source?.length) parts.push(`Source: ${filters.source.join(', ')}`)
    if (filters.scoreMin != null || filters.scoreMax != null) {
      parts.push(`Score: ${filters.scoreMin ?? 0}–${filters.scoreMax ?? 100}`)
    }
    if (filters.tags?.length) parts.push(`Tags: ${filters.tags.join(', ')}`)
    return parts.length ? parts.join(' · ') : 'No filters applied'
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Segments</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Save dynamic lead filters as reusable segments
          </p>
        </div>
        <Button onClick={() => { setEditSegment(null); setShowBuilder(true) }}>
          <Plus className="h-4 w-4" />
          New Segment
        </Button>
      </div>

      {/* Segments grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 animate-pulse">
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-3" />
              <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded w-full mb-2" />
              <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : segments.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="h-14 w-14 rounded-full bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center mb-4">
            <Layers className="h-7 w-7 text-indigo-500" />
          </div>
          <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-1">No segments yet</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xs mb-5">
            Create reusable filters to quickly find the right leads for any campaign or follow-up.
          </p>
          <Button onClick={() => setShowBuilder(true)}>
            <Plus className="h-4 w-4" />
            Create your first segment
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {segments.map(seg => (
            <div key={seg.id} className="group bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-card hover:border-indigo-300 dark:hover:border-indigo-600 transition-colors p-5 flex flex-col">
              {/* Card header */}
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate">{seg.name}</h3>
                  {seg.description && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{seg.description}</p>
                  )}
                </div>
                {/* Lead count badge */}
                <span className="ml-2 shrink-0 flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 text-xs font-semibold">
                  <Users className="h-3 w-3" />
                  {seg.leadCount}
                </span>
              </div>

              {/* Filter summary */}
              <p className="text-[11px] text-gray-400 dark:text-gray-500 flex-1 leading-relaxed mb-3">
                <Filter className="h-3 w-3 inline mr-1" />
                {summarizeFilters(seg.filters || {})}
              </p>

              {/* Actions */}
              <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-800">
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => { setEditSegment(seg); setShowBuilder(true) }}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors"
                    title="Edit segment"
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(seg)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                    title="Delete segment"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <Link
                  to={`/leads?segmentId=${seg.id}&segmentName=${encodeURIComponent(seg.name)}`}
                  className="flex items-center gap-1 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  View leads
                  <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit modal */}
      {showBuilder && (
        <SegmentBuilderModal
          initial={editSegment}
          onClose={() => { setShowBuilder(false); setEditSegment(null) }}
          onSave={handleSave}
        />
      )}
    </div>
  )
}
