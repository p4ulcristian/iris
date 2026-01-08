import { useState, useEffect, useCallback } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faChevronLeft,
  faChevronRight,
  faRotate,
  faPlus,
  faExclamationTriangle,
  faExternalLink,
  faTimes,
  faCalendarDay,
  faCalendarWeek
} from '@fortawesome/free-solid-svg-icons'

// Helper to get start of week (Monday)
function getWeekStart(date) {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  d.setHours(0, 0, 0, 0)
  return d
}

// Helper to format time
function formatTime(dateString) {
  const d = new Date(dateString)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

// Helper to format date
function formatDate(date) {
  return date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
}

// Get week days array
function getWeekDays(startDate) {
  const days = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(startDate)
    d.setDate(d.getDate() + i)
    days.push(d)
  }
  return days
}

function EventCard({ event, compact = false }) {
  const startTime = formatTime(event.start)
  const endTime = event.end ? formatTime(event.end) : null

  return (
    <div
      className={`rounded-lg border border-accent/30 bg-accent/10 ${compact ? 'px-2 py-1' : 'px-3 py-2'} cursor-pointer hover:bg-accent/20 transition-colors`}
    >
      <div className={`${compact ? 'text-xs' : 'text-sm'} text-text-primary font-medium truncate`}>
        {event.summary}
      </div>
      {!compact && (
        <div className="text-xs text-text-tertiary mt-0.5">
          {event.allDay ? 'All day' : `${startTime}${endTime ? ` - ${endTime}` : ''}`}
        </div>
      )}
      {compact && !event.allDay && (
        <div className="text-[10px] text-text-tertiary">{startTime}</div>
      )}
    </div>
  )
}

function DayColumn({ date, events, isToday, onSelectDay }) {
  const dayEvents = events.filter(e => {
    const eventDate = new Date(e.start)
    return eventDate.toDateString() === date.toDateString()
  })

  return (
    <div
      className={`flex-1 min-w-0 border-r border-border last:border-r-0 ${
        isToday ? 'bg-accent/5' : ''
      }`}
      onClick={() => onSelectDay(date)}
    >
      <div className={`text-center py-2 border-b border-border ${isToday ? 'bg-accent/10' : 'bg-black/20'}`}>
        <div className="text-xs text-text-tertiary uppercase">
          {date.toLocaleDateString([], { weekday: 'short' })}
        </div>
        <div className={`text-lg font-medium ${isToday ? 'text-accent' : 'text-text-primary'}`}>
          {date.getDate()}
        </div>
      </div>
      <div className="p-1 space-y-1 min-h-[120px]">
        {dayEvents.slice(0, 4).map(event => (
          <EventCard key={event.id} event={event} compact />
        ))}
        {dayEvents.length > 4 && (
          <div className="text-xs text-text-tertiary text-center py-1">
            +{dayEvents.length - 4} more
          </div>
        )}
      </div>
    </div>
  )
}

function CreateEventModal({ initialDate, send, onClose }) {
  const [summary, setSummary] = useState('')
  const [date, setDate] = useState(initialDate?.toISOString().split('T')[0] || new Date().toISOString().split('T')[0])
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('10:00')
  const [allDay, setAllDay] = useState(false)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    const handleMessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.event === 'calendar:event:created') {
          setCreating(false)
          onClose(true) // Refresh after creation
        }
        if (msg.event === 'calendar:error') {
          setCreating(false)
          console.error('Calendar error:', msg.error)
        }
      } catch {}
    }

    const ws = window.__irisWs
    if (ws) {
      ws.addEventListener('message', handleMessage)
      return () => ws.removeEventListener('message', handleMessage)
    }
  }, [onClose])

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!summary.trim() || creating) return

    setCreating(true)

    const eventData = {
      event: 'calendar:event:create',
      summary: summary.trim()
    }

    if (allDay) {
      eventData.start = date
      eventData.end = date
    } else {
      eventData.start = `${date}T${startTime}:00`
      eventData.end = `${date}T${endTime}:00`
    }

    send(eventData)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-bg-secondary border border-white/10 rounded-xl shadow-2xl w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-lg text-text-primary font-medium">New Event</h2>
          <button onClick={onClose} className="text-text-tertiary hover:text-text-primary transition-colors">
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-xs text-text-tertiary mb-1">Title *</label>
            <input
              type="text"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Event title"
              className="w-full px-3 py-2 text-sm bg-black/30 border border-white/10 rounded-lg focus:outline-none focus:border-accent/50 text-text-primary placeholder:text-text-tertiary"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs text-text-tertiary mb-1">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-black/30 border border-white/10 rounded-lg focus:outline-none focus:border-accent/50 text-text-primary"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="allDay"
              checked={allDay}
              onChange={(e) => setAllDay(e.target.checked)}
              className="rounded"
            />
            <label htmlFor="allDay" className="text-sm text-text-secondary">All day event</label>
          </div>

          {!allDay && (
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="block text-xs text-text-tertiary mb-1">Start</label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-black/30 border border-white/10 rounded-lg focus:outline-none focus:border-accent/50 text-text-primary"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs text-text-tertiary mb-1">End</label>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-black/30 border border-white/10 rounded-lg focus:outline-none focus:border-accent/50 text-text-primary"
                />
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!summary.trim() || creating}
              className="px-4 py-2 text-sm bg-accent/20 text-accent border border-accent/30 rounded-lg hover:bg-accent/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {creating ? 'Creating...' : 'Create Event'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function DayView({ date, events, onBack }) {
  const dayEvents = events.filter(e => {
    const eventDate = new Date(e.start)
    return eventDate.toDateString() === date.toDateString()
  }).sort((a, b) => new Date(a.start) - new Date(b.start))

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-4 px-4 py-3 border-b border-border bg-black/20">
        <button
          onClick={onBack}
          className="px-3 py-1.5 text-sm bg-black/30 text-text-secondary border border-white/10 rounded-lg hover:text-text-primary hover:border-white/20 transition-colors"
        >
          <FontAwesomeIcon icon={faChevronLeft} className="mr-2" />
          Back to Week
        </button>
        <h2 className="text-lg text-text-primary font-medium">
          {date.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {dayEvents.length === 0 ? (
          <div className="text-center py-12 text-text-tertiary">
            No events scheduled for this day
          </div>
        ) : (
          <div className="space-y-3">
            {dayEvents.map(event => (
              <div
                key={event.id}
                className="bg-black/20 border border-white/10 rounded-lg p-4 hover:border-accent/30 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-text-primary font-medium">{event.summary}</h3>
                    <p className="text-sm text-text-tertiary mt-1">
                      {event.allDay ? 'All day' : `${formatTime(event.start)} - ${formatTime(event.end)}`}
                    </p>
                    {event.location && (
                      <p className="text-sm text-text-secondary mt-1">{event.location}</p>
                    )}
                    {event.description && (
                      <p className="text-sm text-text-secondary mt-2 whitespace-pre-wrap">{event.description}</p>
                    )}
                  </div>
                  {event.htmlLink && (
                    <a
                      href={event.htmlLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-text-tertiary hover:text-accent transition-colors"
                      title="Open in Google Calendar"
                    >
                      <FontAwesomeIcon icon={faExternalLink} />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default function CalendarView({ send }) {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [currentWeekStart, setCurrentWeekStart] = useState(getWeekStart(new Date()))
  const [selectedDay, setSelectedDay] = useState(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createDate, setCreateDate] = useState(null)

  const weekDays = getWeekDays(currentWeekStart)
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Fetch events for current week
  const fetchEvents = useCallback(() => {
    setLoading(true)
    setError(null)

    const timeMin = new Date(currentWeekStart)
    const timeMax = new Date(currentWeekStart)
    timeMax.setDate(timeMax.getDate() + 7)

    send({
      event: 'calendar:events:fetch',
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString()
    })
  }, [send, currentWeekStart])

  // Fetch on mount and week change
  useEffect(() => {
    fetchEvents()
  }, [fetchEvents])

  // Handle WebSocket messages
  useEffect(() => {
    const handleMessage = (event) => {
      try {
        const msg = JSON.parse(event.data)

        if (msg.event === 'calendar:events:response') {
          setEvents(msg.events || [])
          setLoading(false)
        }

        if (msg.event === 'calendar:error') {
          setError(msg.error)
          setLoading(false)
        }
      } catch {}
    }

    const ws = window.__irisWs
    if (ws) {
      ws.addEventListener('message', handleMessage)
      return () => ws.removeEventListener('message', handleMessage)
    }
  }, [])

  const navigateWeek = (direction) => {
    const newStart = new Date(currentWeekStart)
    newStart.setDate(newStart.getDate() + (direction * 7))
    setCurrentWeekStart(newStart)
    setSelectedDay(null)
  }

  const goToToday = () => {
    setCurrentWeekStart(getWeekStart(new Date()))
    setSelectedDay(null)
  }

  const handleCreateEvent = (date) => {
    setCreateDate(date || null)
    setShowCreateModal(true)
  }

  const handleModalClose = (refresh) => {
    setShowCreateModal(false)
    setCreateDate(null)
    if (refresh) {
      fetchEvents()
    }
  }

  // Show day view if a day is selected
  if (selectedDay) {
    return (
      <DayView
        date={selectedDay}
        events={events}
        onBack={() => setSelectedDay(null)}
      />
    )
  }

  return (
    <div className="h-full flex flex-col p-4">
      {/* Header */}
      <div className="flex items-center gap-4 mb-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigateWeek(-1)}
            className="px-3 py-1.5 text-sm bg-black/30 text-text-secondary border border-white/10 rounded-lg hover:text-text-primary hover:border-white/20 transition-colors"
          >
            <FontAwesomeIcon icon={faChevronLeft} />
          </button>
          <button
            onClick={goToToday}
            className="px-3 py-1.5 text-sm bg-black/30 text-text-secondary border border-white/10 rounded-lg hover:text-text-primary hover:border-white/20 transition-colors"
          >
            Today
          </button>
          <button
            onClick={() => navigateWeek(1)}
            className="px-3 py-1.5 text-sm bg-black/30 text-text-secondary border border-white/10 rounded-lg hover:text-text-primary hover:border-white/20 transition-colors"
          >
            <FontAwesomeIcon icon={faChevronRight} />
          </button>
        </div>

        <h2 className="text-lg text-text-primary font-medium">
          {currentWeekStart.toLocaleDateString([], { month: 'long', year: 'numeric' })}
        </h2>

        <div className="flex-1" />

        <button
          onClick={() => handleCreateEvent()}
          className="flex items-center gap-2 px-3 py-1.5 text-sm bg-green-500/20 text-green-400 border border-green-500/30 rounded-lg hover:bg-green-500/30 transition-colors"
        >
          <FontAwesomeIcon icon={faPlus} />
          New Event
        </button>
        <button
          onClick={fetchEvents}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-1.5 text-sm bg-accent/20 text-accent border border-accent/30 rounded-lg hover:bg-accent/30 transition-colors disabled:opacity-50"
        >
          <FontAwesomeIcon icon={faRotate} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Error state */}
      {error && (
        <div className="mb-4 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
          <FontAwesomeIcon icon={faExclamationTriangle} className="mr-2" />
          {error}
        </div>
      )}

      {/* Week view */}
      <div className="flex-1 bg-black/20 border border-white/10 rounded-xl overflow-hidden">
        {loading && events.length === 0 ? (
          <div className="h-full flex items-center justify-center text-text-tertiary">
            Loading events...
          </div>
        ) : (
          <div className="h-full flex">
            {weekDays.map((day, idx) => (
              <DayColumn
                key={idx}
                date={day}
                events={events}
                isToday={day.toDateString() === today.toDateString()}
                onSelectDay={setSelectedDay}
              />
            ))}
          </div>
        )}
      </div>

      {/* Create event modal */}
      {showCreateModal && (
        <CreateEventModal
          initialDate={createDate}
          send={send}
          onClose={handleModalClose}
        />
      )}
    </div>
  )
}
