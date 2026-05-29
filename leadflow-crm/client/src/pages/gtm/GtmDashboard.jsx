import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { gtmApi } from '../../api/gtm.api'
import Button from '../../components/ui/Button'
import Badge from '../../components/ui/Badge'
import Spinner from '../../components/ui/Spinner'
import {
  Rocket, Plus, Play, Pause, Trash2, Search, Globe, Target,
  TrendingUp, Users, Zap, ChevronRight,
} from 'lucide-react'

const STATUS_COLORS = {
  DRAFT: 'gray',
  ACTIVE: 'green',
  PAUSED: 'yellow',
  ARCHIVED: 'red',
}

export default function GtmDashboard() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['gtm-workspaces'],
    queryFn: () => gtmApi.listWorkspaces().then(r => r.data),
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => gtmApi.deleteWorkspace(id),
    onSuccess: () => {
      toast.success('Workspace deleted')
      queryClient.refetchQueries({ queryKey: ['gtm-workspaces'] })
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed to delete workspace'),
  })

  const workspaces = data?.data || []

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" />
      </div>
    )
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
            <Rocket className="h-7 w-7 text-indigo-500" />
            GTM Engine
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Automated lead sourcing, enrichment, and scoring workspaces
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4" />
          New Workspace
        </Button>
      </div>

      {/* Empty state */}
      {workspaces.length === 0 && (
        <div className="text-center py-16 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
          <Target className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">No GTM Workspaces Yet</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 max-w-md mx-auto">
            Create a workspace to define your Ideal Customer Profile and start sourcing leads from Google Maps, web scrapers, and more.
          </p>
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" />
            Create Your First Workspace
          </Button>
        </div>
      )}

      {/* Workspace cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {workspaces.map((ws) => (
          <div
            key={ws.id}
            className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 hover:shadow-md transition-shadow cursor-pointer group"
            onClick={() => navigate(`/gtm/${ws.id}`)}
          >
            <div className="flex items-start justify-between mb-3">
              <h3 className="font-semibold text-gray-900 dark:text-white truncate pr-2">{ws.name}</h3>
              <Badge variant={STATUS_COLORS[ws.status] || 'gray'}>{ws.status}</Badge>
            </div>

            {ws.icpNatural && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 line-clamp-2">{ws.icpNatural}</p>
            )}

            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="text-center">
                <p className="text-lg font-bold text-gray-900 dark:text-white">{ws._count?.entities || 0}</p>
                <p className="text-[10px] text-gray-500 uppercase tracking-wide">Entities</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-gray-900 dark:text-white">{ws._count?.sourcingRuns || 0}</p>
                <p className="text-[10px] text-gray-500 uppercase tracking-wide">Runs</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-gray-900 dark:text-white">{ws._count?.signals || 0}</p>
                <p className="text-[10px] text-gray-500 uppercase tracking-wide">Signals</p>
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-700">
              <span className="text-[11px] text-gray-400">
                {new Date(ws.updatedAt).toLocaleDateString()}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    if (window.confirm(`Delete workspace "${ws.name}"? This removes all its entities and signals.`)) {
                      deleteMutation.mutate(ws.id)
                    }
                  }}
                  className="p-1.5 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  title="Delete workspace"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
                <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-indigo-500 transition-colors" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Create modal */}
      {showCreate && (
        <CreateWorkspaceModal onClose={() => setShowCreate(false)} />
      )}
    </div>
  )
}

function CreateWorkspaceModal({ onClose }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({
    name: '',
    icpNatural: '',
    queries: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim()) { setError('Name is required'); return }

    setSubmitting(true)
    setError('')

    try {
      const queries = form.queries
        .split('\n')
        .map(q => q.trim())
        .filter(Boolean)

      await gtmApi.createWorkspace({
        name: form.name.trim(),
        icpNatural: form.icpNatural.trim() || null,
        sourcingConfig: queries.length > 0
          ? { sources: ['google_maps'], queries }
          : null,
      })

      queryClient.refetchQueries({ queryKey: ['gtm-workspaces'] })
      toast.success('Workspace created')
      onClose()
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to create workspace'
      setError(msg)
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg mx-4 p-6" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <Target className="h-5 w-5 text-indigo-500" />
          New GTM Workspace
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Workspace Name</label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Miami Restaurants, SaaS Startups NYC"
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ICP Description</label>
            <textarea
              value={form.icpNatural}
              onChange={e => setForm({ ...form, icpNatural: e.target.value })}
              placeholder="Describe your ideal customer in plain English&#10;e.g. Local restaurants with 4+ stars, 100+ reviews, in downtown Miami"
              rows={3}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Search Queries <span className="text-gray-400 font-normal">(one per line)</span>
            </label>
            <textarea
              value={form.queries}
              onChange={e => setForm({ ...form, queries: e.target.value })}
              placeholder="restaurants in Miami FL&#10;fine dining Miami Beach&#10;seafood restaurant Brickell"
              rows={3}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none font-mono"
            />
            <p className="text-[11px] text-gray-400 mt-1">These will be used to search Google Maps via Apify</p>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={onClose} type="button">Cancel</Button>
            <Button type="submit" loading={submitting}>Create Workspace</Button>
          </div>
        </form>
      </div>
    </div>
  )
}
