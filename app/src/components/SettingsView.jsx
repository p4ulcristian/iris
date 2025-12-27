import { useState, useEffect } from 'react'
import { useStore } from '../store'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faEye,
  faEyeSlash,
  faCheck,
  faExternalLink
} from '@fortawesome/free-solid-svg-icons'

function SettingCard({ title, description, children }) {
  return (
    <div className="bg-black/20 border border-white/10 rounded-xl p-4">
      <h3 className="text-sm font-medium text-text-primary mb-1">{title}</h3>
      {description && (
        <p className="text-xs text-text-tertiary mb-3">{description}</p>
      )}
      {children}
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
        <a
          href={helpUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-accent hover:underline flex items-center gap-1"
        >
          {helpText || 'Get your API key'}
          <FontAwesomeIcon icon={faExternalLink} className="text-[10px]" />
        </a>
      )}
    </div>
  )
}

export default function SettingsView({ send }) {
  const settings = useStore(s => s.settings) || {}

  const handleSaveLinearKey = (value) => {
    send({ event: 'settings:update', key: 'linearApiKey', value })
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-xl font-medium text-text-primary">Settings</h1>
          <p className="text-sm text-text-tertiary">Configure Iris integrations and preferences</p>
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
          </div>
        </div>
      </div>
    </div>
  )
}
