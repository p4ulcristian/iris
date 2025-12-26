import { useEffect, useRef } from 'react'

export default function ConfirmModal({
  isOpen,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  danger = false,
  onConfirm,
  onCancel
}) {
  const confirmRef = useRef(null)

  // Focus confirm button and handle keyboard
  useEffect(() => {
    if (isOpen) {
      confirmRef.current?.focus()

      const handleKeyDown = (e) => {
        if (e.key === 'Escape') {
          onCancel()
        } else if (e.key === 'Enter') {
          onConfirm()
        }
      }

      window.addEventListener('keydown', handleKeyDown)
      return () => window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onConfirm, onCancel])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onCancel}
      />

      {/* Modal */}
      <div className="relative bg-bg-secondary border border-border rounded-lg shadow-xl w-80 p-4">
        <h3 className="text-text-primary font-medium mb-2">{title}</h3>
        <p className="text-text-secondary text-sm mb-4">{message}</p>

        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary hover:bg-bg-tertiary rounded transition-all"
          >
            {cancelText}
          </button>
          <button
            ref={confirmRef}
            onClick={onConfirm}
            className={`
              px-3 py-1.5 text-sm font-medium rounded transition-all
              ${danger
                ? 'bg-red-500/20 text-red-500 hover:bg-red-500/30'
                : 'bg-accent text-white hover:bg-[#5a62e0]'
              }
            `}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
