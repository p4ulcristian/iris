// Google Calendar API client
// Requires OAuth credentials: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET

import { google } from 'googleapis'
import { appState, saveState, applySettingsToEnv } from './state.js'

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/userinfo.email'
]

const REDIRECT_URI = 'http://localhost:9998/oauth/google/callback'

function getCredentials() {
  return {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET
  }
}

function getOAuth2Client() {
  const { clientId, clientSecret } = getCredentials()
  if (!clientId || !clientSecret) {
    return null
  }
  return new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI)
}

function getTokens() {
  return appState.settings?.googleCalendar
}

function setTokens(tokens) {
  if (!appState.settings) {
    appState.settings = {}
  }
  appState.settings.googleCalendar = tokens
  saveState()
}

function clearTokens() {
  if (appState.settings) {
    delete appState.settings.googleCalendar
    saveState()
  }
}

async function getAuthenticatedClient() {
  const oauth2Client = getOAuth2Client()
  if (!oauth2Client) {
    throw new Error('Google OAuth credentials not configured')
  }

  const tokens = getTokens()
  if (!tokens?.refresh_token) {
    throw new Error('Google Calendar not connected')
  }

  oauth2Client.setCredentials(tokens)

  // Check if access token needs refresh
  if (tokens.expiry_date && Date.now() >= tokens.expiry_date - 60000) {
    try {
      const { credentials } = await oauth2Client.refreshAccessToken()
      setTokens(credentials)
      oauth2Client.setCredentials(credentials)
    } catch (err) {
      console.error('Failed to refresh token:', err)
      throw new Error('Failed to refresh Google Calendar token. Please reconnect.')
    }
  }

  return oauth2Client
}

// Generate OAuth URL for user consent
export function getAuthUrl() {
  const oauth2Client = getOAuth2Client()
  if (!oauth2Client) {
    throw new Error('Google OAuth credentials not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.')
  }

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent' // Force consent to get refresh token
  })
}

// Exchange authorization code for tokens
export async function handleAuthCallback(code) {
  const oauth2Client = getOAuth2Client()
  if (!oauth2Client) {
    throw new Error('Google OAuth credentials not configured')
  }

  const { tokens } = await oauth2Client.getToken(code)

  // Get user email
  oauth2Client.setCredentials(tokens)
  const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client })
  const { data: userInfo } = await oauth2.userinfo.get()

  setTokens({
    ...tokens,
    email: userInfo.email
  })

  return { email: userInfo.email }
}

// Disconnect Google Calendar
export function disconnect() {
  clearTokens()
}

// List calendar events
export async function listEvents(timeMin, timeMax, calendarId = 'primary') {
  const auth = await getAuthenticatedClient()
  const calendar = google.calendar({ version: 'v3', auth })

  const response = await calendar.events.list({
    calendarId,
    timeMin: timeMin || new Date().toISOString(),
    timeMax: timeMax || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 100
  })

  return response.data.items.map(event => ({
    id: event.id,
    summary: event.summary,
    description: event.description,
    start: event.start.dateTime || event.start.date,
    end: event.end.dateTime || event.end.date,
    allDay: !event.start.dateTime,
    location: event.location,
    htmlLink: event.htmlLink,
    status: event.status,
    colorId: event.colorId
  }))
}

// Get a single event
export async function getEvent(eventId, calendarId = 'primary') {
  const auth = await getAuthenticatedClient()
  const calendar = google.calendar({ version: 'v3', auth })

  const response = await calendar.events.get({
    calendarId,
    eventId
  })

  const event = response.data
  return {
    id: event.id,
    summary: event.summary,
    description: event.description,
    start: event.start.dateTime || event.start.date,
    end: event.end.dateTime || event.end.date,
    allDay: !event.start.dateTime,
    location: event.location,
    htmlLink: event.htmlLink,
    status: event.status,
    colorId: event.colorId,
    attendees: event.attendees
  }
}

// Create a new event
export async function createEvent({ summary, start, end, description, location }, calendarId = 'primary') {
  const auth = await getAuthenticatedClient()
  const calendar = google.calendar({ version: 'v3', auth })

  // Determine if all-day event (date only vs datetime)
  const isAllDay = !start.includes('T')

  const eventResource = {
    summary,
    description,
    location,
    start: isAllDay ? { date: start } : { dateTime: start, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
    end: isAllDay ? { date: end || start } : { dateTime: end || start, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }
  }

  const response = await calendar.events.insert({
    calendarId,
    resource: eventResource
  })

  const event = response.data
  return {
    id: event.id,
    summary: event.summary,
    start: event.start.dateTime || event.start.date,
    end: event.end.dateTime || event.end.date,
    htmlLink: event.htmlLink
  }
}

// Update an existing event
export async function updateEvent(eventId, updates, calendarId = 'primary') {
  const auth = await getAuthenticatedClient()
  const calendar = google.calendar({ version: 'v3', auth })

  // First get the existing event
  const { data: existing } = await calendar.events.get({
    calendarId,
    eventId
  })

  // Merge updates
  const eventResource = { ...existing }
  if (updates.summary !== undefined) eventResource.summary = updates.summary
  if (updates.description !== undefined) eventResource.description = updates.description
  if (updates.location !== undefined) eventResource.location = updates.location
  if (updates.start) {
    const isAllDay = !updates.start.includes('T')
    eventResource.start = isAllDay ? { date: updates.start } : { dateTime: updates.start, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }
  }
  if (updates.end) {
    const isAllDay = !updates.end.includes('T')
    eventResource.end = isAllDay ? { date: updates.end } : { dateTime: updates.end, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }
  }

  const response = await calendar.events.update({
    calendarId,
    eventId,
    resource: eventResource
  })

  const event = response.data
  return {
    id: event.id,
    summary: event.summary,
    start: event.start.dateTime || event.start.date,
    end: event.end.dateTime || event.end.date,
    htmlLink: event.htmlLink
  }
}

// Delete an event
export async function deleteEvent(eventId, calendarId = 'primary') {
  const auth = await getAuthenticatedClient()
  const calendar = google.calendar({ version: 'v3', auth })

  await calendar.events.delete({
    calendarId,
    eventId
  })

  return { deleted: true }
}

// List user's calendars
export async function listCalendars() {
  const auth = await getAuthenticatedClient()
  const calendar = google.calendar({ version: 'v3', auth })

  const response = await calendar.calendarList.list()

  return response.data.items.map(cal => ({
    id: cal.id,
    summary: cal.summary,
    primary: cal.primary || false,
    backgroundColor: cal.backgroundColor
  }))
}

// Check if calendar is configured and connected
export function isConfigured() {
  const { clientId, clientSecret } = getCredentials()
  return !!clientId && !!clientSecret
}

export function isConnected() {
  const tokens = getTokens()
  return !!tokens?.refresh_token
}

export function getConnectionInfo() {
  const tokens = getTokens()
  return {
    configured: isConfigured(),
    connected: isConnected(),
    email: tokens?.email || null
  }
}
