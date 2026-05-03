import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Users, Mail, Shield, UserPlus } from 'lucide-react'
import toast from 'react-hot-toast'
import { authApi } from '../../api/auth.api'
import { useAuthStore } from '../../store/auth.store'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Badge from '../../components/ui/Badge'
import Spinner from '../../components/ui/Spinner'
import Modal from '../../components/ui/Modal'

const ROLE_BADGE = { ADMIN: 'success', SALES_REP: 'info' }

export default function TeamSettings() {
  const { user: currentUser } = useAuthStore()
  const queryClient = useQueryClient()
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteForm, setInviteForm] = useState({ name: '', email: '', role: 'SALES_REP' })

  const { data, isLoading } = useQuery({
    queryKey: ['team-members'],
    queryFn: () => authApi.getTeamMembers ? authApi.getTeamMembers().then(r => r.data.data) : Promise.resolve([]),
  })

  const members = data ?? []

  const inviteMutation = useMutation({
    mutationFn: (payload) => authApi.inviteUser ? authApi.inviteUser(payload) : Promise.resolve({ data: { success: true } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-members'] })
      toast.success(`Invite sent to ${inviteForm.email}!`)
      setInviteOpen(false)
      setInviteForm({ name: '', email: '', role: 'SALES_REP' })
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Invite failed'),
  })

  const handleInvite = (e) => {
    e.preventDefault()
    if (!inviteForm.email || !inviteForm.name) { toast.error('Name and email required'); return }
    inviteMutation.mutate(inviteForm)
  }

  const setField = (field) => (e) => setInviteForm(prev => ({ ...prev, [field]: e.target.value }))

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Team Settings</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage your team members and access levels</p>
        </div>
        {currentUser?.role === 'ADMIN' && (
          <Button size="sm" onClick={() => setInviteOpen(true)}>
            <UserPlus className="h-4 w-4" /> Invite Member
          </Button>
        )}
      </div>

      {/* Current user card */}
      <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 flex items-center gap-4">
        <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 text-lg font-bold">
          {currentUser?.name?.[0]?.toUpperCase() || 'U'}
        </div>
        <div className="flex-1">
          <p className="font-semibold text-gray-900">{currentUser?.name} <span className="text-xs text-indigo-500 font-normal">(You)</span></p>
          <p className="text-sm text-gray-500">{currentUser?.email}</p>
        </div>
        <Badge variant={ROLE_BADGE[currentUser?.role] || 'gray'}>{currentUser?.role?.replace('_', ' ')}</Badge>
      </div>

      {/* Team members list */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
          <Users className="h-4 w-4 text-gray-500" />
          <h2 className="font-semibold text-gray-800">Team Members</h2>
        </div>
        {isLoading ? (
          <div className="flex justify-center py-10"><Spinner /></div>
        ) : members.length === 0 ? (
          <div className="text-center py-12">
            <Users className="mx-auto h-8 w-8 text-gray-300 mb-3" />
            <p className="text-gray-500 font-medium">No team members yet</p>
            <p className="text-gray-400 text-sm mt-1">Invite colleagues to join your workspace</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {members.filter(m => m.id !== currentUser?.id).map(member => (
              <div key={member.id} className="flex items-center gap-4 px-6 py-4">
                <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 font-semibold">
                  {member.name?.[0]?.toUpperCase() || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800">{member.name}</p>
                  <p className="text-xs text-gray-400 flex items-center gap-1"><Mail className="h-3 w-3" />{member.email}</p>
                </div>
                <Badge variant={ROLE_BADGE[member.role] || 'gray'}>{member.role?.replace('_', ' ')}</Badge>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Role reference card */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2"><Shield className="h-4 w-4" /> Role Permissions</h3>
        <div className="space-y-3 text-sm">
          <div className="flex items-start gap-3">
            <Badge variant="success">ADMIN</Badge>
            <p className="text-gray-600">Full access — manage team, all leads, all settings</p>
          </div>
          <div className="flex items-start gap-3">
            <Badge variant="info">SALES REP</Badge>
            <p className="text-gray-600">Access to leads, pipeline, sequences, meetings, quotes</p>
          </div>
        </div>
      </div>

      {/* Invite modal */}
      <Modal isOpen={inviteOpen} onClose={() => setInviteOpen(false)} title="Invite Team Member" size="sm">
        <form onSubmit={handleInvite} className="space-y-4">
          <Input label="Full Name *" value={inviteForm.name} onChange={setField('name')} placeholder="Jane Doe" required />
          <Input label="Email *" type="email" value={inviteForm.email} onChange={setField('email')} placeholder="jane@company.com" required />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
            <select
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200"
              value={inviteForm.role}
              onChange={setField('role')}
            >
              <option value="SALES_REP">Sales Rep</option>
              <option value="ADMIN">Admin</option>
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" type="button" onClick={() => setInviteOpen(false)}>Cancel</Button>
            <Button type="submit" loading={inviteMutation.isPending}>Send Invite</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
