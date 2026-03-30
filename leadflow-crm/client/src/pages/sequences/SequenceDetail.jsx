import { useState, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Edit2, Trash2, Check, X, ChevronRight, Users, GripVertical } from 'lucide-react'
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd'
import toast from 'react-hot-toast'
import { sequencesApi } from '../../api/sequences.api'
import { leadsApi } from '../../api/leads.api'
import { formatDateTime, formatRelativeTime, getInitials } from '../../utils/format'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Modal from '../../components/ui/Modal'
import Spinner from '../../components/ui/Spinner'
import Badge from '../../components/ui/Badge'

const ENROLLMENT_STATUS_MAP = {
  ACTIVE: 'success',
  PAUSED: 'warning',
  COMPLETED: 'info',
}

function AddStepModal({ isOpen, onClose, sequenceId }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({ subject: '', body: '', delayDays: 0 })

  const mutation = useMutation({
    mutationFn: (data) => sequencesApi.addStep(sequenceId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sequence', sequenceId] })
      toast.success('Step added!')
      onClose()
      setForm({ subject: '', body: '', delayDays: 0 })
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed to add step'),
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    mutation.mutate({ ...form, delayDays: parseInt(form.delayDays, 10) || 0 })
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add Step" size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Subject *"
          value={form.subject}
          onChange={(e) => setForm((prev) => ({ ...prev, subject: e.target.value }))}
          placeholder="e.g. Following up on your interest"
          required
        />
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Body <span className="text-gray-400 font-normal">(HTML supported)</span>
          </label>
          <p className="text-xs text-gray-400 mb-1.5">
            Use placeholders: {'{{first_name}}'}, {'{{company}}'}
          </p>
          <textarea
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500 resize-y"
            rows={6}
            value={form.body}
            onChange={(e) => setForm((prev) => ({ ...prev, body: e.target.value }))}
            placeholder="Hi {{first_name}}, I wanted to follow up..."
            required
          />
        </div>
        <Input
          label="Delay (days after previous step)"
          type="number"
          min="0"
          value={form.delayDays}
          onChange={(e) => setForm((prev) => ({ ...prev, delayDays: e.target.value }))}
        />
        <div className="flex justify-end gap-3">
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={mutation.isPending}>Add Step</Button>
        </div>
      </form>
    </Modal>
  )
}

function EditStepModal({ isOpen, onClose, sequenceId, step }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({
    subject: step?.subject || '',
    body: step?.body || '',
    delayDays: step?.delayDays ?? 0,
  })

  const mutation = useMutation({
    mutationFn: (data) => sequencesApi.updateStep(sequenceId, step.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sequence', sequenceId] })
      toast.success('Step updated!')
      onClose()
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed to update step'),
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    mutation.mutate({ ...form, delayDays: parseInt(form.delayDays, 10) || 0 })
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Edit Step" size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Subject *"
          value={form.subject}
          onChange={(e) => setForm((prev) => ({ ...prev, subject: e.target.value }))}
          required
        />
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Body <span className="text-gray-400 font-normal">(HTML supported)</span>
          </label>
          <p className="text-xs text-gray-400 mb-1.5">
            Use placeholders: {'{{first_name}}'}, {'{{company}}'}
          </p>
          <textarea
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500 resize-y"
            rows={6}
            value={form.body}
            onChange={(e) => setForm((prev) => ({ ...prev, body: e.target.value }))}
            required
          />
        </div>
        <Input
          label="Delay (days)"
          type="number"
          min="0"
          value={form.delayDays}
          onChange={(e) => setForm((prev) => ({ ...prev, delayDays: e.target.value }))}
        />
        <div className="flex justify-end gap-3">
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={mutation.isPending}>Save Changes</Button>
        </div>
      </form>
    </Modal>
  )
}

function EnrollModal({ isOpen, onClose, sequenceId }) {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(new Set())

  const { data: leadsData } = useQuery({
    queryKey: ['leads-enroll', search],
    queryFn: () => leadsApi.getLeads({ search: search || undefined, limit: 20 }).then((r) => r.data),
  })

  const leads = leadsData?.data ?? []

  const mutation = useMutation({
    mutationFn: (data) => sequencesApi.enrollLeads(sequenceId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sequence', sequenceId] })
      toast.success(`Enrolled ${selected.size} lead(s)!`)
      onClose()
      setSelected(new Set())
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Enrollment failed'),
  })

  const toggleLead = (leadId) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(leadId)) next.delete(leadId)
      else next.add(leadId)
      return next
    })
  }

  const handleEnroll = () => {
    if (selected.size === 0) { toast.error('Select at least one lead'); return }
    mutation.mutate({ leadIds: Array.from(selected) })
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Enroll Leads" size="md">
      <div className="space-y-4">
        <input
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200"
          placeholder="Search leads..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="max-h-64 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
          {leads.length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-8">No leads found</p>
          ) : (
            leads.map((lead) => (
              <label
                key={lead.id}
                className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-gray-50"
              >
                <input
                  type="checkbox"
                  checked={selected.has(lead.id)}
                  onChange={() => toggleLead(lead.id)}
                  className="rounded text-indigo-600 focus:ring-indigo-500"
                />
                <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-700">
                  {getInitials(lead.firstName, lead.lastName)}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-800">{lead.firstName} {lead.lastName}</p>
                  <p className="text-xs text-gray-400">{lead.email}</p>
                </div>
              </label>
            ))
          )}
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500">{selected.size} selected</span>
          <div className="flex gap-3">
            <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
            <Button onClick={handleEnroll} loading={mutation.isPending}>
              Enroll Leads
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

export default function SequenceDetail() {
  const { id } = useParams()
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState('steps')
  const [addStepOpen, setAddStepOpen] = useState(false)
  const [editStep, setEditStep] = useState(null)
  const [deleteStepTarget, setDeleteStepTarget] = useState(null)
  const [enrollOpen, setEnrollOpen] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState('')
  const nameRef = useRef(null)

  const { data: sequence, isLoading } = useQuery({
    queryKey: ['sequence', id],
    queryFn: () => sequencesApi.getSequenceById(id).then((r) => r.data.data),
  })

  const updateNameMutation = useMutation({
    mutationFn: (name) => sequencesApi.updateSequence(id, { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sequence', id] })
      queryClient.invalidateQueries({ queryKey: ['sequences'] })
      toast.success('Name updated!')
      setEditingName(false)
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed to update name'),
  })

  const deleteStepMutation = useMutation({
    mutationFn: (stepId) => sequencesApi.deleteStep(id, stepId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sequence', id] })
      toast.success('Step deleted')
      setDeleteStepTarget(null)
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed to delete step'),
  })

  const reorderMutation = useMutation({
    mutationFn: (steps) => sequencesApi.reorderSteps(id, steps),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sequence', id] })
      toast.success('Steps reordered!')
    },
    onError: () => toast.error('Failed to reorder steps'),
  })

  const startEditName = () => {
    setNameInput(sequence?.name || '')
    setEditingName(true)
    setTimeout(() => nameRef.current?.focus(), 50)
  }

  const saveName = () => {
    if (!nameInput.trim()) { toast.error('Name cannot be empty'); return }
    updateNameMutation.mutate(nameInput.trim())
  }

  const handleNameKeyDown = (e) => {
    if (e.key === 'Enter') saveName()
    if (e.key === 'Escape') setEditingName(false)
  }

  const onDragEnd = (result) => {
    if (!result.destination) return
    if (result.destination.index === result.source.index) return

    const reordered = Array.from(steps)
    const [removed] = reordered.splice(result.source.index, 1)
    reordered.splice(result.destination.index, 0, removed)

    const payload = reordered.map((step, idx) => ({ id: step.id, order: idx + 1 }))
    reorderMutation.mutate(payload)
  }

  if (isLoading) {
    return <div className="flex justify-center items-center h-64"><Spinner size="lg" /></div>
  }

  if (!sequence) {
    return <div className="p-6 text-center text-gray-500">Sequence not found.</div>
  }

  const steps = sequence.steps || []
  const enrollments = sequence.enrollments || []

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-gray-500">
        <Link to="/sequences" className="hover:text-indigo-600 transition-colors">Sequences</Link>
        <ChevronRight className="h-4 w-4" />
        <span className="text-gray-800 font-medium">{sequence.name}</span>
      </nav>

      {/* Editable sequence name */}
      <div className="flex items-center gap-3">
        {editingName ? (
          <div className="flex items-center gap-2">
            <input
              ref={nameRef}
              className="text-2xl font-bold text-gray-900 border-b-2 border-indigo-500 bg-transparent focus:outline-none"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={handleNameKeyDown}
            />
            <button
              onClick={saveName}
              className="p-1 text-green-600 hover:bg-green-50 rounded"
              title="Save"
            >
              <Check className="h-5 w-5" />
            </button>
            <button
              onClick={() => setEditingName(false)}
              className="p-1 text-gray-400 hover:bg-gray-100 rounded"
              title="Cancel"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900">{sequence.name}</h1>
            <button
              onClick={startEditName}
              className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
              title="Edit name"
            >
              <Edit2 className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-6">
          {[
            { key: 'steps', label: `Steps (${steps.length})` },
            { key: 'enrollments', label: `Enrollments (${enrollments.length})` },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`pb-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
                activeTab === tab.key
                  ? 'text-indigo-600 border-indigo-600'
                  : 'text-gray-500 border-transparent hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Steps Tab */}
      {activeTab === 'steps' && (
        <div className="space-y-3">
          {steps.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl border border-gray-100">
              <p className="text-gray-500 font-medium">No steps yet</p>
              <p className="text-gray-400 text-sm mt-1">Add your first step to start this sequence</p>
              <Button size="sm" className="mt-4" onClick={() => setAddStepOpen(true)}>
                <Plus className="h-4 w-4" /> Add First Step
              </Button>
            </div>
          ) : (
            <>
              <DragDropContext onDragEnd={onDragEnd}>
                <Droppable droppableId="steps">
                  {(provided) => (
                    <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-3">
                      {steps.map((step, index) => (
                        <Draggable key={step.id} draggableId={step.id} index={index}>
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              className={`bg-white rounded-xl border border-gray-100 shadow-sm p-5 ${
                                snapshot.isDragging ? 'shadow-lg ring-2 ring-indigo-300' : ''
                              }`}
                            >
                              <div className="flex items-start justify-between gap-4">
                                <div className="flex items-start gap-4 flex-1 min-w-0">
                                  {/* Drag handle */}
                                  <div
                                    {...provided.dragHandleProps}
                                    className="flex-shrink-0 mt-1 cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500"
                                  >
                                    <GripVertical className="h-5 w-5" />
                                  </div>
                                  <div className="flex-shrink-0">
                                    <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 text-sm font-bold">
                                      {index + 1}
                                    </span>
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                      <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                                        Day {step.delayDays || 0}
                                      </span>
                                    </div>
                                    <p className="text-sm font-semibold text-gray-800 mb-1">{step.subject}</p>
                                    <p className="text-sm text-gray-500 line-clamp-2">
                                      {step.body?.replace(/<[^>]+>/g, '') || '(No body)'}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-1 flex-shrink-0">
                                  <button
                                    className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                    onClick={() => setEditStep(step)}
                                    title="Edit"
                                  >
                                    <Edit2 className="h-4 w-4" />
                                  </button>
                                  <button
                                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                    onClick={() => setDeleteStepTarget(step.id)}
                                    title="Delete"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </DragDropContext>
              <Button variant="secondary" size="sm" onClick={() => setAddStepOpen(true)}>
                <Plus className="h-4 w-4" /> Add Step
              </Button>
            </>
          )}
        </div>
      )}

      {/* Enrollments Tab */}
      {activeTab === 'enrollments' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setEnrollOpen(true)}>
              <Users className="h-4 w-4" /> Enroll Leads
            </Button>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            {enrollments.length === 0 ? (
              <div className="text-center py-12">
                <Users className="mx-auto h-8 w-8 text-gray-300 mb-3" />
                <p className="text-gray-500 font-medium">No enrollments yet</p>
                <p className="text-gray-400 text-sm mt-1">Enroll leads to start sending them through this sequence</p>
              </div>
            ) : (
              <table className="min-w-full divide-y divide-gray-100">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Lead</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Current Step</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Enrolled</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {enrollments.map((enr) => (
                    <tr key={enr.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-700">
                            {getInitials(enr.lead?.firstName, enr.lead?.lastName)}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-800">
                              {enr.lead?.firstName} {enr.lead?.lastName}
                            </p>
                            <p className="text-xs text-gray-400">{enr.lead?.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <Badge variant={ENROLLMENT_STATUS_MAP[enr.status] || 'gray'}>{enr.status}</Badge>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">Step {enr.currentStep ?? 1}</td>
                      <td className="px-6 py-4 text-sm text-gray-500">{formatRelativeTime(enr.enrolledAt || enr.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Modals */}
      <AddStepModal isOpen={addStepOpen} onClose={() => setAddStepOpen(false)} sequenceId={id} />
      {editStep && (
        <EditStepModal
          isOpen={!!editStep}
          onClose={() => setEditStep(null)}
          sequenceId={id}
          step={editStep}
        />
      )}
      <EnrollModal isOpen={enrollOpen} onClose={() => setEnrollOpen(false)} sequenceId={id} />

      {/* Delete step confirmation */}
      <Modal isOpen={!!deleteStepTarget} onClose={() => setDeleteStepTarget(null)} title="Delete Step" size="sm">
        <p className="text-sm text-gray-600 mb-6">Are you sure you want to delete this step?</p>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setDeleteStepTarget(null)}>Cancel</Button>
          <Button
            variant="danger"
            loading={deleteStepMutation.isPending}
            onClick={() => deleteStepMutation.mutate(deleteStepTarget)}
          >
            Delete
          </Button>
        </div>
      </Modal>
    </div>
  )
}
