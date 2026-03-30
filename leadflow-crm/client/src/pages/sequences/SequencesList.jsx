import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Eye, Trash2, Mail } from 'lucide-react'
import toast from 'react-hot-toast'
import { sequencesApi } from '../../api/sequences.api'
import { formatRelativeTime } from '../../utils/format'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Modal from '../../components/ui/Modal'
import Spinner from '../../components/ui/Spinner'

function CreateSequenceModal({ isOpen, onClose }) {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')

  const mutation = useMutation({
    mutationFn: (data) => sequencesApi.createSequence(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sequences'] })
      toast.success('Sequence created!')
      onClose()
      setName('')
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed to create sequence'),
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!name.trim()) { toast.error('Name is required'); return }
    mutation.mutate({ name: name.trim() })
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="New Sequence" size="sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Sequence Name *"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Cold Outreach Sequence"
          required
        />
        <div className="flex justify-end gap-3">
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={mutation.isPending}>Create</Button>
        </div>
      </form>
    </Modal>
  )
}

function ConfirmDeleteModal({ isOpen, onClose, onConfirm, loading }) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Delete Sequence" size="sm">
      <p className="text-sm text-gray-600 mb-6">
        Are you sure you want to delete this sequence? All steps and enrollments will be removed.
      </p>
      <div className="flex justify-end gap-3">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant="danger" loading={loading} onClick={onConfirm}>Delete</Button>
      </div>
    </Modal>
  )
}

export default function SequencesList() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)

  const { data, isLoading } = useQuery({
    queryKey: ['sequences'],
    queryFn: () => sequencesApi.getSequences().then((r) => r.data),
  })

  const sequences = data?.data ?? []

  const deleteMutation = useMutation({
    mutationFn: (id) => sequencesApi.deleteSequence(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sequences'] })
      toast.success('Sequence deleted')
      setDeleteTarget(null)
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed to delete sequence'),
  })

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Email Sequences</h1>
          <p className="text-sm text-gray-500 mt-0.5">Automate your outreach campaigns</p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" /> New Sequence
        </Button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-16"><Spinner size="lg" /></div>
        ) : sequences.length === 0 ? (
          <div className="text-center py-16">
            <div className="mx-auto w-12 h-12 rounded-full bg-indigo-50 flex items-center justify-center mb-4">
              <Mail className="h-5 w-5 text-indigo-400" />
            </div>
            <p className="text-gray-600 font-medium">No sequences yet</p>
            <p className="text-gray-400 text-sm mt-1">Create your first email sequence to start automating outreach</p>
            <div className="mt-4">
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" /> Create Sequence
              </Button>
            </div>
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Steps</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Enrolled</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {sequences.map((seq) => (
                <tr
                  key={seq.id}
                  className="hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => navigate(`/sequences/${seq.id}`)}
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center">
                        <Mail className="h-4 w-4 text-indigo-500" />
                      </div>
                      <span className="text-sm font-medium text-gray-900">{seq.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {seq.steps?.length ?? 0} steps
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {seq.enrollments?.length ?? seq.enrolledCount ?? 0} leads
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">{formatRelativeTime(seq.createdAt)}</td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                      <button
                        className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                        onClick={() => navigate(`/sequences/${seq.id}`)}
                        title="View"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      <button
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        onClick={() => setDeleteTarget(seq.id)}
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

      <CreateSequenceModal isOpen={createOpen} onClose={() => setCreateOpen(false)} />
      <ConfirmDeleteModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteMutation.mutate(deleteTarget)}
        loading={deleteMutation.isPending}
      />
    </div>
  )
}
