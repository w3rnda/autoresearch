import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, X } from 'lucide-react'
import { useDebounce } from '../../hooks/useDebounce'
import { searchApi } from '../../api/search.api'

export default function GlobalSearch() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const debounced = useDebounce(query, 300)
  const navigate = useNavigate()
  const ref = useRef(null)

  useEffect(() => {
    if (debounced.length < 2) { setResults(null); return }
    setLoading(true)
    searchApi.search(debounced)
      .then(r => { setResults(r.data.data); setOpen(true) })
      .catch(() => setResults(null))
      .finally(() => setLoading(false))
  }, [debounced])

  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const hasResults = results && (results.leads?.length || results.deals?.length || results.meetings?.length)

  return (
    <div ref={ref} className="relative w-full max-w-md">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          className="w-full pl-9 pr-9 py-2 text-sm bg-gray-100 dark:bg-gray-800 dark:text-gray-100 rounded-lg border-0 focus:ring-2 focus:ring-indigo-300 focus:outline-none placeholder-gray-400"
          placeholder="Search leads, deals, meetings..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => results && setOpen(true)}
        />
        {query && (
          <button
            className="absolute right-3 top-1/2 -translate-y-1/2"
            onClick={() => { setQuery(''); setResults(null); setOpen(false) }}
          >
            <X className="h-4 w-4 text-gray-400 hover:text-gray-600" />
          </button>
        )}
      </div>
      {open && (
        <div className="absolute top-full mt-1 left-0 right-0 z-50 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl max-h-96 overflow-y-auto">
          {loading && <p className="text-sm text-gray-400 px-4 py-3">Searching...</p>}
          {!loading && !hasResults && (
            <p className="text-sm text-gray-400 px-4 py-3">No results for "{query}"</p>
          )}
          {results?.leads?.length > 0 && (
            <div>
              <p className="px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider bg-gray-50 dark:bg-gray-800">
                Leads
              </p>
              {results.leads.map(lead => (
                <button
                  key={lead.id}
                  className="w-full text-left px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-3"
                  onClick={() => { navigate(`/leads/${lead.id}`); setOpen(false); setQuery('') }}
                >
                  <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-700 flex-shrink-0">
                    {(lead.firstName?.[0] || '?').toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-100">
                      {lead.firstName} {lead.lastName}
                    </p>
                    <p className="text-xs text-gray-400">{lead.company || lead.email}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
          {results?.deals?.length > 0 && (
            <div>
              <p className="px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider bg-gray-50 dark:bg-gray-800">
                Deals
              </p>
              {results.deals.map(deal => (
                <button
                  key={deal.id}
                  className="w-full text-left px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800"
                  onClick={() => { navigate('/pipeline'); setOpen(false); setQuery('') }}
                >
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-100">
                    {deal.lead?.firstName} {deal.lead?.lastName} — {deal.stage}
                  </p>
                </button>
              ))}
            </div>
          )}
          {results?.meetings?.length > 0 && (
            <div>
              <p className="px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider bg-gray-50 dark:bg-gray-800">
                Meetings
              </p>
              {results.meetings.map(meeting => (
                <button
                  key={meeting.id}
                  className="w-full text-left px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800"
                  onClick={() => { navigate('/meetings'); setOpen(false); setQuery('') }}
                >
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-100">
                    {meeting.lead?.firstName} {meeting.lead?.lastName}
                  </p>
                  <p className="text-xs text-gray-400">
                    {new Date(meeting.scheduledAt).toLocaleDateString()}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
