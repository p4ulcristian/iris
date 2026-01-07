import { useState, useEffect, useRef, useCallback } from 'react'
import { useStore } from '../store'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faPlay,
  faPause,
  faRotateLeft,
  faForward,
  faGear,
  faCoffee,
  faBrain,
  faVolumeHigh,
  faVolumeXmark
} from '@fortawesome/free-solid-svg-icons'

// Web Audio API sound generator
const createAudioContext = () => {
  if (typeof window !== 'undefined') {
    return new (window.AudioContext || window.webkitAudioContext)()
  }
  return null
}

const playTone = (frequency, duration, type = 'sine', volume = 0.3) => {
  const ctx = createAudioContext()
  if (!ctx) return

  const oscillator = ctx.createOscillator()
  const gainNode = ctx.createGain()

  oscillator.connect(gainNode)
  gainNode.connect(ctx.destination)

  oscillator.frequency.value = frequency
  oscillator.type = type

  // Fade in and out for smooth sound
  gainNode.gain.setValueAtTime(0, ctx.currentTime)
  gainNode.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.02)
  gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + duration)

  oscillator.start(ctx.currentTime)
  oscillator.stop(ctx.currentTime + duration)
}

// Sound effects
const sounds = {
  start: () => {
    // Ascending double beep - energizing
    playTone(523.25, 0.15, 'sine', 0.25)  // C5
    setTimeout(() => playTone(659.25, 0.2, 'sine', 0.3), 150)  // E5
  },
  pause: () => {
    // Descending tone - calming
    playTone(440, 0.15, 'sine', 0.2)  // A4
    setTimeout(() => playTone(349.23, 0.2, 'sine', 0.15), 120)  // F4
  },
  workDone: () => {
    // Triumphant chord - achievement!
    playTone(523.25, 0.4, 'sine', 0.2)  // C5
    setTimeout(() => playTone(659.25, 0.4, 'sine', 0.2), 50)  // E5
    setTimeout(() => playTone(783.99, 0.5, 'sine', 0.25), 100)  // G5
    setTimeout(() => playTone(1046.5, 0.6, 'triangle', 0.2), 200)  // C6
  },
  breakDone: () => {
    // Gentle wake-up chime
    playTone(392, 0.2, 'sine', 0.2)  // G4
    setTimeout(() => playTone(523.25, 0.2, 'sine', 0.25), 150)  // C5
    setTimeout(() => playTone(659.25, 0.3, 'sine', 0.3), 300)  // E5
  }
}

const DEFAULT_STATE = {
  workMinutes: 25,
  breakMinutes: 5,
  remaining: 25 * 60 * 1000,
  isRunning: false,
  isBreak: false,
  completedPomodoros: 0,
  soundEnabled: true
}

export default function PomodoroView({ entityId, send }) {
  const entity = useStore(s => s.entities[entityId])
  const data = entity?.data || DEFAULT_STATE

  const [showSettings, setShowSettings] = useState(false)
  const [workMin, setWorkMin] = useState(data.workMinutes || 25)
  const [breakMin, setBreakMin] = useState(data.breakMinutes || 5)
  const intervalRef = useRef(null)
  const lastTickRef = useRef(Date.now())

  const formatTime = (ms) => {
    const totalSeconds = Math.ceil(ms / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  }

  // Play sound if enabled
  const playSound = useCallback((soundName) => {
    if (data.soundEnabled && sounds[soundName]) {
      sounds[soundName]()
    }
  }, [data.soundEnabled])

  // Toggle sound
  const handleToggleSound = () => {
    send({
      event: 'entity:update-data',
      entityId,
      data: { ...data, soundEnabled: !data.soundEnabled }
    })
  }

  // Update status on card when timer changes
  useEffect(() => {
    const mode = data.isBreak ? '☕' : '🧠'
    const state = data.isRunning ? '▶' : '⏸'
    const status = `${mode} ${formatTime(data.remaining)} ${state}`
    send({ event: 'entity:set-status', entityId, status })
  }, [data.remaining, data.isBreak, data.isRunning, entityId, send])

  // Update title to show config
  useEffect(() => {
    const title = `${data.workMinutes}/${data.breakMinutes}min · ${data.completedPomodoros} done`
    send({ event: 'entity:set-title', entityId, title })
  }, [data.workMinutes, data.breakMinutes, data.completedPomodoros, entityId, send])

  // Timer logic
  useEffect(() => {
    if (data.isRunning) {
      lastTickRef.current = Date.now()
      intervalRef.current = setInterval(() => {
        const now = Date.now()
        const elapsed = now - lastTickRef.current
        lastTickRef.current = now

        const newRemaining = Math.max(0, data.remaining - elapsed)

        if (newRemaining <= 0) {
          // Timer complete - switch modes
          const nextIsBreak = !data.isBreak
          const nextRemaining = nextIsBreak
            ? data.breakMinutes * 60 * 1000
            : data.workMinutes * 60 * 1000
          const newCompleted = data.isBreak ? data.completedPomodoros : data.completedPomodoros + 1

          // Play completion sound
          if (data.soundEnabled) {
            if (data.isBreak) {
              sounds.breakDone()  // Break finished, back to work
            } else {
              sounds.workDone()   // Work finished, time for break
            }
          }

          send({
            event: 'entity:update-data',
            entityId,
            data: {
              ...data,
              remaining: nextRemaining,
              isBreak: nextIsBreak,
              isRunning: false,
              completedPomodoros: newCompleted
            }
          })
        } else {
          send({
            event: 'entity:update-data',
            entityId,
            data: { ...data, remaining: newRemaining }
          })
        }
      }, 1000)
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [data.isRunning, data.remaining, data.isBreak, data.soundEnabled, entityId, send])

  const handlePlayPause = () => {
    // Play appropriate sound
    if (!data.isRunning) {
      playSound('start')
    } else {
      playSound('pause')
    }
    send({
      event: 'entity:update-data',
      entityId,
      data: { ...data, isRunning: !data.isRunning }
    })
  }

  const handleReset = () => {
    const resetRemaining = data.isBreak
      ? data.breakMinutes * 60 * 1000
      : data.workMinutes * 60 * 1000
    send({
      event: 'entity:update-data',
      entityId,
      data: { ...data, remaining: resetRemaining, isRunning: false }
    })
  }

  const handleSkip = () => {
    const nextIsBreak = !data.isBreak
    const nextRemaining = nextIsBreak
      ? data.breakMinutes * 60 * 1000
      : data.workMinutes * 60 * 1000
    const newCompleted = data.isBreak ? data.completedPomodoros : data.completedPomodoros + 1

    send({
      event: 'entity:update-data',
      entityId,
      data: {
        ...data,
        remaining: nextRemaining,
        isBreak: nextIsBreak,
        isRunning: false,
        completedPomodoros: newCompleted
      }
    })
  }

  const handleSaveSettings = () => {
    const newRemaining = data.isBreak
      ? breakMin * 60 * 1000
      : workMin * 60 * 1000
    send({
      event: 'entity:update-data',
      entityId,
      data: {
        ...data,
        workMinutes: workMin,
        breakMinutes: breakMin,
        remaining: newRemaining,
        isRunning: false
      }
    })
    setShowSettings(false)
  }

  const progress = data.isBreak
    ? 1 - (data.remaining / (data.breakMinutes * 60 * 1000))
    : 1 - (data.remaining / (data.workMinutes * 60 * 1000))

  return (
    <div className="h-full flex flex-col items-center justify-center gap-6 p-6 bg-surface/50">
      {/* Mode indicator */}
      <div className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium ${
        data.isBreak
          ? 'bg-emerald-500/20 text-emerald-400'
          : 'bg-red-500/20 text-red-400'
      }`}>
        <FontAwesomeIcon icon={data.isBreak ? faCoffee : faBrain} />
        {data.isBreak ? 'Break Time' : 'Focus Time'}
      </div>

      {/* Timer display */}
      <div className="relative">
        {/* Progress ring */}
        <svg className="w-48 h-48 -rotate-90" viewBox="0 0 100 100">
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            stroke="currentColor"
            strokeWidth="4"
            className="text-white/10"
          />
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            stroke="currentColor"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={`${progress * 283} 283`}
            className={data.isBreak ? 'text-emerald-500' : 'text-red-500'}
            style={{ transition: 'stroke-dasharray 0.5s ease' }}
          />
        </svg>

        {/* Time text */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-5xl font-mono font-bold text-text-primary">
            {formatTime(data.remaining)}
          </span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleReset}
          className="p-3 rounded-full bg-white/5 hover:bg-white/10 text-text-secondary hover:text-text-primary transition-colors"
          title="Reset"
        >
          <FontAwesomeIcon icon={faRotateLeft} className="w-5 h-5" />
        </button>

        <button
          onClick={handlePlayPause}
          className={`p-4 rounded-full text-white transition-colors ${
            data.isBreak
              ? 'bg-emerald-500 hover:bg-emerald-600'
              : 'bg-red-500 hover:bg-red-600'
          }`}
        >
          <FontAwesomeIcon
            icon={data.isRunning ? faPause : faPlay}
            className="w-6 h-6"
          />
        </button>

        <button
          onClick={handleSkip}
          className="p-3 rounded-full bg-white/5 hover:bg-white/10 text-text-secondary hover:text-text-primary transition-colors"
          title="Skip to next"
        >
          <FontAwesomeIcon icon={faForward} className="w-5 h-5" />
        </button>
      </div>

      {/* Completed count */}
      <div className="text-sm text-text-tertiary">
        {data.completedPomodoros} pomodoro{data.completedPomodoros !== 1 ? 's' : ''} completed
      </div>

      {/* Settings and sound toggles */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleToggleSound}
          className={`p-2 rounded-lg transition-colors ${
            data.soundEnabled
              ? 'bg-white/5 hover:bg-white/10 text-text-secondary hover:text-text-primary'
              : 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
          }`}
          title={data.soundEnabled ? 'Mute sounds' : 'Unmute sounds'}
        >
          <FontAwesomeIcon icon={data.soundEnabled ? faVolumeHigh : faVolumeXmark} />
        </button>
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-text-secondary hover:text-text-primary transition-colors"
        >
          <FontAwesomeIcon icon={faGear} />
        </button>
      </div>

      {/* Settings panel */}
      {showSettings && (
        <div className="bg-black/40 border border-white/10 rounded-xl p-4 w-64">
          <div className="space-y-4">
            <div>
              <label className="text-xs text-text-secondary block mb-1">Work (minutes)</label>
              <input
                type="number"
                min="1"
                max="120"
                value={workMin}
                onChange={(e) => setWorkMin(parseInt(e.target.value) || 25)}
                className="w-full px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-sm text-text-primary"
              />
            </div>
            <div>
              <label className="text-xs text-text-secondary block mb-1">Break (minutes)</label>
              <input
                type="number"
                min="1"
                max="60"
                value={breakMin}
                onChange={(e) => setBreakMin(parseInt(e.target.value) || 5)}
                className="w-full px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-sm text-text-primary"
              />
            </div>
            <button
              onClick={handleSaveSettings}
              className="w-full py-2 bg-accent/20 hover:bg-accent/30 border border-accent/50 rounded-lg text-sm text-text-primary transition-colors"
            >
              Save & Reset Timer
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
