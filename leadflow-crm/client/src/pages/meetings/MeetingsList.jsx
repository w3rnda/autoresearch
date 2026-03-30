import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Edit2, Trash2, Calendar, Copy } from 'lucide-react'
import toast from 'react-hot-toast'
import { meetingsApi } from '../../api/meetings.api'
import { leadsApi } from '../../api/leads.api'
import { useAuthStore } from '../../store/auth.store'
import { formatDateTime, getInitials } from '../../utils/format'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Modal from '../../components/ui/Modal'
import Spinner from '../../components/ui/Spinner'

const FILTER_TABS = [
  { key: 'all', label: 'All' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'past', label: 'Past' },
]

function LeadSearchInput({ value, onSelect }) {
  const [search, setSearch] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)

  const { data: leadsData } = useQuery({
    queryKey: ['leads-meeting-search', search],
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
        value={value ? `${value.firstName} ${value.lastName}` : search}
        onChange={(e) => { setSearch(e.target.value); onSelect(null); setShowDropdown(true) }}
        onFocus={() => setShowDropdown(true)}
      />
      {showDropdown && leads.length > 0 && !value && (
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

function MeetingFormModal({ isOpen, onClose, meeting, onSubmit, loading }) {
  const [selectedLead, setSelectedLead] = useState(
    meeting?.lead ? { id: meeting.lead.id, firstName: meeting.lead.firstName, lastName: meeting.lead.lastName } : null
  )
  const [scheduledAt, setScheduledAt] = useState(
    meeting?.scheduledAt ? new Date(meeting.scheduledAt).toISOString().slice(0, 16) : ''
  )
  const [notes, setNotes] = useState(meeting?.notes || '')

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!selectedLead) { toast.error('Please select a lead'); return }
    onSubmit({ leadId: selectedLead.id, scheduledAt, notes })
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={meeting ? 'Edit Meeting' : 'Schedule Meeting'} size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <LeadSearchInput value={selectedLead} onSelect={setSelectedLead} />
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Date & Time *</label>
          <input
            type="datetime-local"
            required
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
          <textarea
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200 resize-y"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Meeting agenda or notes..."
          />
        </div>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={loading}>{meeting ? 'Save Changes' : 'Schedule'}</Button>
        </div>
      </form>
    </Modal>
  )
}

export default function MeetingsList() {
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const [filter, setFilter] = useState('all')
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [editTarget, setEditTarget] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)

  const { data, isLoading } = useQuery({
    queryKey: ['meetings', filter],
    queryFn: () => meetingsApi.getMeetings({ filter }).then((r) => r.data),
  })

  const meetings = data?.data ?? []

  const createMutation = useMutation({
    mutationFn: (data) => meetingsApi.createMeeting(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meetings'] })
      toast.success('Meeting scheduled!')
      setScheduleOpen(false)
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed to schedule meeting'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => meetingsApi.updateMeeting(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meetings'] })
      toast.success('Meeting updated!')
      setEditTarget(null)
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed to update meeting'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => meetingsApi.deleteMeeting(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meetings'] })
      toast.success('Meeting deleted')
      setDeleteTarget(null)
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed to delete meeting'),
  })

  const copyBookingLink = () => {
    const link = `${window.location.origin}/book/${user?.id || user?.id}`
    navigator.clipboard.writeText(link).then(() => {
      toast.success('Booking link copied to clipboard!')
    }).catch(() => toast.error('Failed to copy link'))
  }

  const filteredMeetings = meetings.filter((m) => {
    const now = new Date()
    const scheduledAt = new Date(m.scheduledAt)
    if (filter === 'upcoming') return scheduledAt >= now
    if (filter === 'past') return scheduledAt < now
    return true
  })

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Meetings</h1>
          <p className="text-sm text-gray-500 mt-0.5">{filteredMeetings.length} meetings</p>
        </div>
        <div className="flex gap-3">
          <Button variant="secondary" size="sm" onClick={copyBookingLink}>
            <Copy className="h-4 w-4" /> Copy Booking Link
          </Button>
          <Button size="sm" onClick={() => setScheduleOpen(true)}>
            <Plus className="h-4 w-4" /> Schedule Meeting
          </Button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              filter === tab.key
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
        ) : filteredMeetings.length === 0 ? (
          <div className="text-center py-16">
            <Calendar className="mx-auto h-10 w-10 text-gray-300 mb-3" />
            <p className="text-gray-500 font-medium">No meetings found</p>
            <p className="text-gray-400 text-sm mt-1">Schedule a meeting to get started</p>
            <Button size="sm" className="mt-4" onClick={() => setScheduleOpen(true)}>
              <Plus className="h-4 w-4" /> Schedule Meeting
            </Button>
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Lead</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Scheduled</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Notes</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Scheduled By</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredMeetings.map((meeting) => {
                const isPast = new Date(meeting.scheduledAt) < new Date()
                return (
                  <tr key={meeting.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-700 flex-shrink-0">
                          {getInitials(meeting.lead?.firstName, meeting.lead?.lastName)}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-800">
                            {meeting.lead?.firstName} {meeting.lead?.lastName}
                          </p>
                          {meeting.lead?.company && (
                            <p className="text-xs text-gray-400">{meeting.lead.company}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`text-sm ${isPast ? 'text-gray-400' : 'text-gray-800 font-medium'}`}>
                        {formatDateTime(meeting.scheduledAt)}
                      </span>
                      {isPast && <span className="ml-2 text-xs text-gray-400">(past)</span>}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 max-w-xs">
                      <p className="truncate">{meeting.notes || '—'}</p>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {meeting.scheduledBy?.name || '—'}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                          onClick={() => setEditTarget(meeting)}
                          title="Edit"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          onClick={() => setDeleteTarget(meeting.id)}
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Modals */}
      <MeetingFormModal
        isOpen={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        onSubmit={(data) => createMutation.mutate(data)}
        loading={createMutation.isPending}
      />

      {editTarget && (
        <MeetingFormModal
          isOpen={!!editTarget}
          onClose={() => setEditTarget(null)}
          meeting={editTarget}
          onSubmit={(data) => updateMutation.mutate({ id: editTarget.id, data })}
          loading={updateMutation.isPending}
        />
      )}

      <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete Meeting" size="sm">
        <p className="text-sm text-gray-600 mb-6">Are you sure you want to delete this meeting?</p>
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
