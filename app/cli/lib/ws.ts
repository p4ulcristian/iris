/**
 * WebSocket client for Iris CLI.
 */

import { getWsUrl } from "./env"

const TIMEOUT = 2000

/**
 * Send a message to Iris and close immediately.
 */
export async function send(message: Record<string, unknown>): Promise<boolean> {
  const url = getWsUrl()

  return new Promise((resolve) => {
    try {
      const ws = new WebSocket(url)
      const timer = setTimeout(() => {
        ws.close()
        resolve(false)
      }, TIMEOUT)

      ws.onopen = () => {
        ws.send(JSON.stringify(message))
        clearTimeout(timer)
        ws.close()
        resolve(true)
      }

      ws.onerror = () => {
        clearTimeout(timer)
        resolve(false)
      }
    } catch {
      resolve(false)
    }
  })
}

/**
 * Send a message and wait for a specific response event.
 */
export async function request<T>(
  message: Record<string, unknown>,
  responseEvent: string,
  timeout = 5000
): Promise<T | null> {
  const url = getWsUrl()

  return new Promise((resolve) => {
    try {
      const ws = new WebSocket(url)
      const timer = setTimeout(() => {
        ws.close()
        resolve(null)
      }, timeout)

      ws.onopen = () => {
        ws.send(JSON.stringify(message))
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          if (data.event === responseEvent) {
            clearTimeout(timer)
            ws.close()
            resolve(data as T)
          }
        } catch {
          // Ignore parse errors
        }
      }

      ws.onerror = () => {
        clearTimeout(timer)
        resolve(null)
      }
    } catch {
      resolve(null)
    }
  })
}
