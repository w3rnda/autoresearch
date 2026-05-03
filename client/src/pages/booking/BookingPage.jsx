import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Zap, CheckCircle, Calendar, Clock } from 'lucide-react'
import toast from 'react-hot-toast'
import { meetingsApi } from '../../api/meetings.api'
import { formatDate, formatDateTime } from '../../utils/format'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Spinner from '../../components/ui/Spinner'

const BUSINESS_DAYS_AHEAD = 7

function getNextBusinessDays(count) {
  const days = []
  const now = new Date()
  let cursor = new Date(now)
  cursor.setHours(0, 0, 0, 0)

  while (days.length < count) {
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000)
    const dayOfWeek = cursor.getDay()
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      days.push(new Date(cursor))
    }
  }
  return days
}

function getTimeSlotsForDay(date, availability) {
  if (!availability || !date) return []
  const dateKey = date.toISOString().slice(0, 10)
  if (availability.slots) {
    return (availability.slots[dateKey] || [])
  }
  // Fallback: generate default 9am-5pm slots
  const slots = []
  for (let h = 9; h < 17; h++) {
    const d = new Date(date)
    d.setHours(h, 0, 0, 0)
    slots.push(d.toISOString())
  }
  return slots
}

function dayLabel(date) {
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).format(date)
}

function timeLabel(iso) {
  return new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }).format(new Date(iso))
}

export default function BookingPage() {
  const { userId } = useParams()
  const [selectedDate, setSelectedDate] = useState(null)
  const [selectedSlot, setSelectedSlot] = useState(null)
  const [confirmed, setConfirmed] = useState(null)
  const [form, setForm] = useState({ name: '', email: '', company: '', notes: '' })

  const businessDays = getNextBusinessDays(BUSINESS_DAYS_AHEAD)

  const { data: availability, isLoading, isError } = useQuery({
    queryKey: ['availability', userId],
    queryFn: () => meetingsApi.getAvailability(userId).then((r) => r.data.data),
    retry: 1,
  })

  const bookMutation = useMutation({
    mutationFn: (data) => meetingsApi.bookMeeting(data),
    onSuccess: (res) => {
      const meeting = res.data?.data || {}
      setConfirmed({ scheduledAt: selectedSlot, ...meeting })
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Booking failed. Please try again.'),
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!selectedSlot) { toast.error('Please select a time slot'); return }
    bookMutation.mutate({
      userId,
      leadName: form.name,
      leadEmail: form.email,
      leadCompany: form.company || undefined,
      notes: form.notes || undefined,
      scheduledAt: selectedSlot,
    })
  }

  const setField = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }))

  // Success screen
  if (confirmed) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex flex-col">
        <div className="flex items-center gap-2 px-8 py-5 border-b border-gray-100 bg-white/80 backdrop-blur-sm">
          <Zap className="h-6 w-6 text-indigo-600" />
          <span className="font-bold text-gray-900 text-lg">LeadFlow</span>
        </div>

        <div className="flex-1 flex items-center justify-center p-6">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-10 max-w-md w-full text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="h-9 w-9 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Your meeting is confirmed!</h2>
            <p className="text-gray-500 text-sm mb-6">
              A confirmation has been sent to <span className="font-medium text-gray-700">{form.email}</span>.
            </p>

            <div className="bg-indigo-50 rounded-xl p-4 mb-6 text-left space-y-2">
              <div className="flex items-center gap-2 text-sm text-gray-700">
                <Calendar className="h-4 w-4 text-indigo-500 flex-shrink-0" />
                <span className="font-medium">{formatDate(confirmed.scheduledAt)}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-700">
                <Clock className="h-4 w-4 text-indigo-500 flex-shrink-0" />
                <span className="font-medium">{timeLabel(confirmed.scheduledAt)}</span>
              </div>
            </div>

            {availability?.user?.name && (
              <p className="text-sm text-gray-500 mb-6">
                Meeting with <span className="font-semibold text-gray-800">{availability.user.name}</span>
              </p>
            )}

            <a
              href="/"
              className="inline-flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-700 font-medium"
            >
              Back to homepage
            </a>
          </div>
        </div>
      </div>
    )
  }

  // Error / user not found
  if (isError) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <div className="flex items-center gap-2 px-8 py-5 border-b border-gray-100 bg-white">
          <Zap className="h-6 w-6 text-indigo-600" />
          <span className="font-bold text-gray-900 text-lg">LeadFlow</span>
        </div>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center">
            <p className="text-gray-500 font-medium text-lg">Booking page not found</p>
            <p className="text-gray-400 text-sm mt-2">This booking link may be invalid or expired.</p>
            <a href="/" className="mt-4 inline-block text-sm text-indigo-600 hover:underline">Return to homepage</a>
          </div>
        </div>
      </div>
    )
  }

  const currentSlots = selectedDate ? getTimeSlotsForDay(selectedDate, availability) : []

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 px-8 py-5 border-b border-gray-100 bg-white/80 backdrop-blur-sm">
        <Zap className="h-6 w-6 text-indigo-600" />
        <span className="font-bold text-gray-900 text-lg">LeadFlow</span>
      </div>

      <div className="flex-1 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 w-full max-w-2xl">
          {/* Page heading */}
          <div className="px-8 pt-8 pb-6 border-b border-gray-100">
            {isLoading ? (
              <div className="animate-pulse">
                <div className="h-7 bg-gray-200 rounded w-2/3 mb-2" />
                <div className="h-4 bg-gray-100 rounded w-1/2" />
              </div>
            ) : (
              <>
                <h1 className="text-2xl font-bold text-gray-900">
                  Book a meeting with {availability?.user?.name || 'us'}
                </h1>
                <p className="text-gray-500 text-sm mt-1">
                  Select a date and time that works for you
                </p>
              </>
            )}
          </div>

          {isLoading ? (
            <div className="flex justify-center py-16"><Spinner size="lg" /></div>
          ) : (
            <div className="px-8 py-6 space-y-6">
              {/* Date selection */}
              <div>
                <p className="text-sm font-semibold text-gray-700 mb-3">Select a date</p>
                <div className="flex flex-wrap gap-2">
                  {businessDays.map((day) => {
                    const isSelected = selectedDate?.toDateString() === day.toDateString()
                    return (
                      <button
                        key={day.toISOString()}
                        onClick={() => { setSelectedDate(day); setSelectedSlot(null) }}
                        className={`px-4 py-2.5 rounded-xl text-sm font-medium border transition-all ${
                          isSelected
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                            : 'bg-white text-gray-700 border-gray-200 hover:border-indigo-300 hover:bg-indigo-50'
                        }`}
                      >
                        {dayLabel(day)}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Time slot selection */}
              {selectedDate && (
                <div>
                  <p className="text-sm font-semibold text-gray-700 mb-3">Select a time</p>
                  {currentSlots.length === 0 ? (
                    <p className="text-sm text-gray-400">No available slots for this day.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {currentSlots.map((slot) => {
                        const slotIso = typeof slot === 'string' ? slot : slot.toISOString()
                        const isSelected = selectedSlot === slotIso
                        return (
                          <button
                            key={slotIso}
                            onClick={() => setSelectedSlot(slotIso)}
                            className={`px-4 py-2 rounded-lg text-sm font-medium border transition-all ${
                              isSelected
                                ? 'bg-indigo-600 text-white border-indigo-600'
                                : 'bg-white text-gray-700 border-gray-200 hover:border-indigo-300 hover:bg-indigo-50'
                            }`}
                          >
                            {timeLabel(slotIso)}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Booking form */}
              {selectedSlot && (
                <form onSubmit={handleSubmit} className="space-y-4 pt-2 border-t border-gray-100">
                  <p className="text-sm font-semibold text-gray-700">Your details</p>
                  <Input
                    label="Your Name *"
                    value={form.name}
                    onChange={setField('name')}
                    placeholder="Jane Doe"
                    required
                  />
                  <Input
                    label="Your Email *"
                    type="email"
                    value={form.email}
                    onChange={setField('email')}
                    placeholder="jane@example.com"
                    required
                  />
                  <Input
                    label="Company (optional)"
                    value={form.company}
                    onChange={setField('company')}
                    placeholder="Acme Corp"
                  />
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
                    <textarea
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200 resize-y"
                      rows={3}
                      value={form.notes}
                      onChange={setField('notes')}
                      placeholder="What would you like to discuss?"
                    />
                  </div>
                  <div className="pt-1">
                    <Button type="submit" size="lg" loading={bookMutation.isPending} className="w-full justify-center">
                      Confirm Booking
                    </Button>
                    <p className="text-xs text-gray-400 text-center mt-2">
                      Booking for {formatDateTime(selectedSlot)}
                    </p>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
