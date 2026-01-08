/**
 * Calendar (Google Calendar) handlers.
 */

import { broadcastState } from '../state.js'
import * as calendar from '../calendar.js'

export const handlers = {
  'calendar:status': (ws) => {
    const info = calendar.getConnectionInfo()
    ws.send(JSON.stringify({ event: 'calendar:status:response', ...info }))
  },

  'calendar:auth:start': (ws) => {
    if (!calendar.isConfigured()) {
      ws.send(JSON.stringify({
        event: 'calendar:error',
        error: 'Google OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.'
      }))
      return
    }

    try {
      const authUrl = calendar.getAuthUrl()
      ws.send(JSON.stringify({ event: 'calendar:auth:url', url: authUrl }))
    } catch (err) {
      ws.send(JSON.stringify({ event: 'calendar:error', error: err.message }))
    }
  },

  'calendar:auth:callback': (ws, data) => {
    const { code } = data
    if (!code) {
      ws.send(JSON.stringify({ event: 'calendar:error', error: 'No authorization code provided' }))
      return
    }

    calendar.handleAuthCallback(code).then(result => {
      ws.send(JSON.stringify({ event: 'calendar:auth:success', ...result }))
      broadcastState()
    }).catch(err => {
      ws.send(JSON.stringify({ event: 'calendar:error', error: err.message }))
    })
  },

  'calendar:disconnect': (ws) => {
    calendar.disconnect()
    ws.send(JSON.stringify({ event: 'calendar:disconnected' }))
    broadcastState()
  },

  'calendar:events:fetch': (ws, data) => {
    if (!calendar.isConnected()) {
      ws.send(JSON.stringify({
        event: 'calendar:error',
        error: 'Google Calendar not connected. Connect in Settings.'
      }))
      return
    }

    const { timeMin, timeMax, calendarId } = data
    calendar.listEvents(timeMin, timeMax, calendarId).then(events => {
      ws.send(JSON.stringify({ event: 'calendar:events:response', events }))
    }).catch(err => {
      ws.send(JSON.stringify({ event: 'calendar:error', error: err.message }))
    })
  },

  'calendar:event:get': (ws, data) => {
    const { eventId, calendarId } = data
    if (!eventId) return

    if (!calendar.isConnected()) {
      ws.send(JSON.stringify({ event: 'calendar:error', error: 'Google Calendar not connected' }))
      return
    }

    calendar.getEvent(eventId, calendarId).then(event => {
      ws.send(JSON.stringify({ event: 'calendar:event:response', calendarEvent: event }))
    }).catch(err => {
      ws.send(JSON.stringify({ event: 'calendar:error', error: err.message }))
    })
  },

  'calendar:event:create': (ws, data) => {
    const { summary, start, end, description, location, calendarId } = data
    if (!summary || !start) {
      ws.send(JSON.stringify({ event: 'calendar:error', error: 'Summary and start time required' }))
      return
    }

    if (!calendar.isConnected()) {
      ws.send(JSON.stringify({ event: 'calendar:error', error: 'Google Calendar not connected' }))
      return
    }

    calendar.createEvent({ summary, start, end, description, location }, calendarId).then(event => {
      ws.send(JSON.stringify({ event: 'calendar:event:created', calendarEvent: event }))
    }).catch(err => {
      ws.send(JSON.stringify({ event: 'calendar:error', error: err.message }))
    })
  },

  'calendar:event:update': (ws, data) => {
    const { eventId, updates, calendarId } = data
    if (!eventId) return

    if (!calendar.isConnected()) {
      ws.send(JSON.stringify({ event: 'calendar:error', error: 'Google Calendar not connected' }))
      return
    }

    calendar.updateEvent(eventId, updates, calendarId).then(event => {
      ws.send(JSON.stringify({ event: 'calendar:event:updated', calendarEvent: event }))
    }).catch(err => {
      ws.send(JSON.stringify({ event: 'calendar:error', error: err.message }))
    })
  },

  'calendar:event:delete': (ws, data) => {
    const { eventId, calendarId } = data
    if (!eventId) return

    if (!calendar.isConnected()) {
      ws.send(JSON.stringify({ event: 'calendar:error', error: 'Google Calendar not connected' }))
      return
    }

    calendar.deleteEvent(eventId, calendarId).then(() => {
      ws.send(JSON.stringify({ event: 'calendar:event:deleted', eventId }))
    }).catch(err => {
      ws.send(JSON.stringify({ event: 'calendar:error', error: err.message }))
    })
  },

  'calendar:calendars:fetch': (ws) => {
    if (!calendar.isConnected()) {
      ws.send(JSON.stringify({ event: 'calendar:error', error: 'Google Calendar not connected' }))
      return
    }

    calendar.listCalendars().then(calendars => {
      ws.send(JSON.stringify({ event: 'calendar:calendars:response', calendars }))
    }).catch(err => {
      ws.send(JSON.stringify({ event: 'calendar:error', error: err.message }))
    })
  },
}
