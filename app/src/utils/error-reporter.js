// Error reporter - sends frontend errors to backend for logging

let sendFn = null

export function setErrorReporter(send) {
  sendFn = send
}

export function reportError(error, source, context = {}) {
  if (!sendFn) {
    console.warn('[ErrorReporter] Not initialized, cannot send error')
    return
  }

  const errorData = {
    message: error?.message || String(error),
    stack: error?.stack || null,
    source,
    context,
    timestamp: Date.now()
  }

  sendFn({ event: 'error:report', error: errorData })
}

// Setup global error handlers
export function setupGlobalErrorHandlers(send) {
  setErrorReporter(send)

  // Unhandled JS errors
  window.onerror = (message, source, lineno, colno, error) => {
    reportError(
      error || { message, stack: `${source}:${lineno}:${colno}` },
      'global',
      { source, lineno, colno }
    )
    return false // Let default handler run too
  }

  // Unhandled promise rejections
  window.onunhandledrejection = (event) => {
    reportError(
      event.reason,
      'promise',
      { type: 'unhandledrejection' }
    )
  }
}
