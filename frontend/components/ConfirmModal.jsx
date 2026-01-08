import { useEffect, useRef } from 'react'
import Button from './ui/Button'

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
          <Button
            variant="ghost"
            size="md"
            onClick={onCancel}
          >
            {cancelText}
          </Button>
          <Button
            ref={confirmRef}
            variant="glass"
            size="md"
            color={danger ? 'danger' : undefined}
            onClick={onConfirm}
          >
            {confirmText}
          </Button>
        </div>
      </div>
    </div>
  )
}
