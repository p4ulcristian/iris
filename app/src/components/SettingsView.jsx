import { useState, useEffect } from 'react'
import { useStore } from '../store'
import { THEMES } from '../themes/generated/themes'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faEye,
  faEyeSlash,
  faCheck,
  faExternalLink,
  faPalette,
  faCalendar,
  faLink,
  faUnlink
} from '@fortawesome/free-solid-svg-icons'

function ThemePicker({ send }) {
  const theme = useStore(s => s.theme)

  const handleSelect = (themeId) => {
    send({ event: 'theme:set', theme: themeId })
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {THEMES.map((t) => (
        <button
          key={t.id}
          onClick={() => handleSelect(t.id)}
          className={`px-3 py-2 text-left text-sm flex items-center gap-2 rounded-lg border transition-all ${
            t.id === theme
              ? 'bg-accent/20 border-accent/50 text-text-primary'
              : 'bg-black/20 border-white/10 text-text-secondary hover:bg-black/30 hover:border-white/20'
          }`}
        >
          <span
            className="w-3 h-3 rounded-full border border-white/20 flex-shrink-0"
            style={{ backgroundColor: t.accent }}
          />
          <span className="truncate">{t.label}</span>
          {t.id === theme && (
            <FontAwesomeIcon icon={faCheck} className="ml-auto text-accent text-xs" />
          )}
        </button>
      ))}
    </div>
  )
}

function SettingCard({ title, description, children }) {
  return (
    <div className="bg-black/20 border border-white/10 rounded-xl p-4 border-l-2 border-l-[#C0C0C0]">
      <h3 className="text-sm font-medium text-text-primary mb-1">{title}</h3>
      {description && (
        <p className="text-xs text-text-tertiary mb-3">{description}</p>
      )}
      {children}
    </div>
  )
}

function TextInput({ label, value, onSave, placeholder, helpText, multiline = false }) {
  const [inputValue, setInputValue] = useState(value || '')
  const [saved, setSaved] = useState(false)
  const hasChanged = inputValue !== (value || '')

  useEffect(() => {
    setInputValue(value || '')
  }, [value])

  const handleSave = () => {
    if (hasChanged) {
      onSave(inputValue)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !multiline) {
      handleSave()
    }
  }

  const inputClass = `w-full px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-sm text-text-primary placeholder-text-tertiary focus:outline-none focus:border-accent/50 ${multiline ? 'min-h-[100px] resize-y' : ''}`

  return (
    <div className="flex flex-col gap-2">
      <label className="text-xs text-text-secondary">{label}</label>
      <div className="flex gap-2">
        <div className="flex-1">
          {multiline ? (
            <textarea
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={placeholder}
              className={inputClass}
            />
          ) : (
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              className={inputClass}
            />
          )}
        </div>
        <button
          onClick={handleSave}
          disabled={!hasChanged}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors self-start ${
            saved
              ? 'bg-green-500/20 text-green-400 border border-green-500/30'
              : hasChanged
                ? 'bg-accent/20 text-accent border border-accent/30 hover:bg-accent/30'
                : 'bg-black/30 text-text-tertiary border border-white/10 cursor-not-allowed'
          }`}
        >
          {saved ? (
            <>
              <FontAwesomeIcon icon={faCheck} className="mr-1" />
              Saved
            </>
          ) : (
            'Save'
          )}
        </button>
      </div>
      {helpText && (
        <p className="text-xs text-text-tertiary">{helpText}</p>
      )}
    </div>
  )
}

function GoogleCalendarConnect({ send, settings }) {
  const [connecting, setConnecting] = useState(false)
  const calendarSettings = settings?.googleCalendar || {}
  const isConnected = calendarSettings.connected
  const hasCredentials = settings?.hasGoogleClientId && settings?.hasGoogleClientSecret

  useEffect(() => {
    // Listen for auth URL response
    const handleMessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.event === 'calendar:auth:url') {
          // Open OAuth URL in external browser
          window.open(data.url, '_blank')
          setConnecting(false)
        } else if (data.event === 'calendar:error') {
          console.error('Calendar error:', data.error)
          setConnecting(false)
        }
      } catch (e) {}
    }

    if (window.__irisWs) {
      window.__irisWs.addEventListener('message', handleMessage)
      return () => window.__irisWs.removeEventListener('message', handleMessage)
    }
  }, [])

  const handleConnect = () => {
    setConnecting(true)
    send({ event: 'calendar:auth:start' })
  }

  const handleDisconnect = () => {
    send({ event: 'calendar:disconnect' })
  }

  const handleSaveClientId = (value) => {
    send({ event: 'settings:update', key: 'googleClientId', value })
  }

  const handleSaveClientSecret = (value) => {
    send({ event: 'settings:update', key: 'googleClientSecret', value })
  }

  return (
    <div className="flex flex-col gap-4">
      <ApiKeyInput
        label="Client ID"
        maskedValue={settings?.googleClientId}
        hasValue={settings?.hasGoogleClientId}
        onSave={handleSaveClientId}
        helpUrl="https://console.cloud.google.com/apis/credentials"
        helpText="Get OAuth credentials from Google Cloud Console"
      />
      <ApiKeyInput
        label="Client Secret"
        maskedValue={settings?.googleClientSecret}
        hasValue={settings?.hasGoogleClientSecret}
        onSave={handleSaveClientSecret}
      />

      <div className="pt-2 border-t border-white/10">
        {isConnected ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500"></span>
              <span className="text-sm text-text-primary">
                Connected as <strong>{calendarSettings.email}</strong>
              </span>
            </div>
            <button
              onClick={handleDisconnect}
              className="px-3 py-1.5 rounded-lg text-sm bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors flex items-center gap-2"
            >
              <FontAwesomeIcon icon={faUnlink} />
              Disconnect
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-tertiary">
              {hasCredentials ? 'Ready to connect' : 'Enter credentials above first'}
            </span>
            <button
              onClick={handleConnect}
              disabled={connecting || !hasCredentials}
              className="px-3 py-1.5 rounded-lg text-sm bg-accent/20 text-accent border border-accent/30 hover:bg-accent/30 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FontAwesomeIcon icon={faLink} />
              {connecting ? 'Opening...' : 'Connect'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function ApiKeyInput({ label, value, maskedValue, hasValue, onSave, helpUrl, helpText }) {
  const [inputValue, setInputValue] = useState('')
  const [showValue, setShowValue] = useState(false)
  const [saved, setSaved] = useState(false)

  // Show masked value when not editing
  const displayValue = inputValue || (showValue ? '' : maskedValue)

  const handleSave = () => {
    if (inputValue) {
      onSave(inputValue)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      setInputValue('')
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleSave()
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="text-xs text-text-secondary">{label}</label>
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <input
            type={showValue ? 'text' : 'password'}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={hasValue ? maskedValue : 'Enter API key...'}
            className="w-full px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-sm text-text-primary placeholder-text-tertiary focus:outline-none focus:border-accent/50"
          />
        </div>
        <button
          onClick={() => setShowValue(!showValue)}
          className="px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-text-secondary hover:text-text-primary hover:border-white/20 transition-colors"
          title={showValue ? 'Hide' : 'Show'}
        >
          <FontAwesomeIcon icon={showValue ? faEyeSlash : faEye} />
        </button>
        <button
          onClick={handleSave}
          disabled={!inputValue}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            saved
              ? 'bg-green-500/20 text-green-400 border border-green-500/30'
              : inputValue
                ? 'bg-accent/20 text-accent border border-accent/30 hover:bg-accent/30'
                : 'bg-black/30 text-text-tertiary border border-white/10 cursor-not-allowed'
          }`}
        >
          {saved ? (
            <>
              <FontAwesomeIcon icon={faCheck} className="mr-1" />
              Saved
            </>
          ) : (
            'Save'
          )}
        </button>
      </div>
      {helpUrl && (
        <button
          onClick={() => window.iris?.openExternal(helpUrl)}
          className="text-xs text-accent hover:underline flex items-center gap-1 text-left"
        >
          {helpText || 'Get your API key'}
          <FontAwesomeIcon icon={faExternalLink} className="text-[10px]" />
        </button>
      )}
    </div>
  )
}

export default function SettingsView({ send }) {
  const settings = useStore(s => s.settings) || {}

  const handleSaveLinearKey = (value) => {
    send({ event: 'settings:update', key: 'linearApiKey', value })
  }

  const handleSaveUserName = (value) => {
    send({ event: 'settings:update', key: 'userName', value })
  }

  const handleSaveStartPrompt = (value) => {
    send({ event: 'settings:update', key: 'startPrompt', value })
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-xl font-medium text-text-primary">Settings</h1>
          <p className="text-sm text-text-tertiary">Configure Iris integrations and preferences</p>
        </div>

        {/* Gods section */}
        <div className="mb-8">
          <h2 className="text-sm font-medium text-text-secondary uppercase tracking-wider mb-3">
            Gods
          </h2>
          <div className="flex flex-col gap-4">
            <SettingCard
              title="Your Name"
              description="How gods will address you"
            >
              <TextInput
                label="Name"
                value={settings.userName}
                onSave={handleSaveUserName}
                placeholder="Paul"
                helpText="Gods will use this name when speaking to you"
              />
            </SettingCard>

            <SettingCard
              title="Start Prompt"
              description="Additional instructions prepended when spawning gods"
            >
              <TextInput
                label="Custom instructions"
                value={settings.startPrompt}
                onSave={handleSaveStartPrompt}
                placeholder="Be concise. Always verify before making changes..."
                helpText="This text is added to every god's initial prompt"
                multiline
              />
            </SettingCard>
          </div>
        </div>

        {/* Appearance section */}
        <div className="mb-8">
          <h2 className="text-sm font-medium text-text-secondary uppercase tracking-wider mb-3">
            Appearance
          </h2>
          <div className="flex flex-col gap-4">
            <SettingCard
              title="Theme"
              description="Choose a color theme for the interface"
            >
              <ThemePicker send={send} />
            </SettingCard>
          </div>
        </div>

        {/* Integrations section */}
        <div className="mb-8">
          <h2 className="text-sm font-medium text-text-secondary uppercase tracking-wider mb-3">
            Integrations
          </h2>
          <div className="flex flex-col gap-4">
            <SettingCard
              title="Linear"
              description="Connect to Linear to view and manage your issues"
            >
              <ApiKeyInput
                label="API Key"
                maskedValue={settings.linearApiKey}
                hasValue={settings.hasLinearApiKey}
                onSave={handleSaveLinearKey}
                helpUrl="https://linear.app/settings/api"
                helpText="Get your Linear API key"
              />
            </SettingCard>

            <SettingCard
              title="Google Calendar"
              description="Connect to Google Calendar to view and create events"
            >
              <GoogleCalendarConnect send={send} settings={settings} />
            </SettingCard>
          </div>
        </div>
      </div>
    </div>
  )
}
