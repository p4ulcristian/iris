/**
 * Entity Views Registry
 *
 * Maps entity types to their View components.
 * This is the single source of truth for entity → component mapping.
 *
 * To add a new entity:
 * 1. Create the View component in app/src/components/ (or app/entities/{type}/)
 * 2. Import it here
 * 3. Add it to ENTITY_VIEWS
 */

import TerminalContent from '../components/TerminalContent'
import BrowserView from '../components/BrowserView'
import HistoryView from '../components/HistoryView'
import GitView from '../components/GitView'
import LinearView from '../components/LinearView'
import SettingsView from '../components/SettingsView'
import CemeteryView from '../components/CemeteryView'
import CalendarView from '../components/CalendarView'
import CodeView from '../components/CodeView'
import OracleView from '../components/OracleView'
import YouTubeMusicView from '../components/YouTubeMusicView'
import MessengerView from '../components/MessengerView'
import DiscordView from '../components/DiscordView'
import PersonalitiesView from '../components/PersonalitiesView'
import RSVPView from '../components/RSVPView'
import MarkdownView from '../components/MarkdownView'
import DrawView from '../components/DrawView'
import PomodoroView from '../components/PomodoroView'
import TodoView from '../components/TodoView'

/**
 * Entity Views Registry
 *
 * Each entry maps an entity type to:
 * - component: The React component to render
 * - props: Function that returns props for the component (receives entity, helpers)
 */
export const ENTITY_VIEWS = {
  god: {
    component: TerminalContent,
    props: (entity, { isFocused }) => ({ entity, isFocused })
  },
  terminal: {
    component: TerminalContent,
    props: (entity, { isFocused }) => ({ entity, isFocused })
  },
  browser: {
    component: BrowserView,
    props: (entity) => ({ entityId: entity.id })
  },
  history: {
    component: HistoryView,
    props: (entity, { send }) => ({ send })
  },
  git: {
    component: GitView,
    props: (entity, { send }) => ({ send })
  },
  linear: {
    component: LinearView,
    props: (entity, { send, connected }) => ({ send, connected })
  },
  settings: {
    component: SettingsView,
    props: (entity, { send }) => ({ send })
  },
  cemetery: {
    component: CemeteryView,
    props: (entity, { send }) => ({ send })
  },
  calendar: {
    component: CalendarView,
    props: (entity, { send }) => ({ send })
  },
  code: {
    component: CodeView,
    props: (entity) => ({ entityId: entity.id })
  },
  oracle: {
    component: OracleView,
    props: (entity) => ({ entityId: entity.id })
  },
  'youtube-music': {
    component: YouTubeMusicView,
    props: (entity) => ({ entityId: entity.id })
  },
  messenger: {
    component: MessengerView,
    props: () => ({})
  },
  discord: {
    component: DiscordView,
    props: () => ({})
  },
  personalities: {
    component: PersonalitiesView,
    props: () => ({})
  },
  rsvp: {
    component: RSVPView,
    props: (entity) => ({ entityId: entity.id })
  },
  markdown: {
    component: MarkdownView,
    props: (entity) => ({ entityId: entity.id })
  },
  draw: {
    component: DrawView,
    props: () => ({})
  },
  pomodoro: {
    component: PomodoroView,
    props: (entity, { send }) => ({ entityId: entity.id, send })
  },
  todo: {
    component: TodoView,
    props: (entity, { send }) => ({ entityId: entity.id, send })
  }
}

/**
 * Get the View component for an entity type
 */
export function getEntityView(type) {
  return ENTITY_VIEWS[type] || null
}

/**
 * Render an entity's View component
 */
export function renderEntityView(entity, helpers) {
  const viewConfig = ENTITY_VIEWS[entity.type]
  if (!viewConfig) {
    return null
  }

  const Component = viewConfig.component
  const props = viewConfig.props(entity, helpers)

  return <Component {...props} />
}
