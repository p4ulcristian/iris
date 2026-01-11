import Database from 'better-sqlite3'
import keytar from 'keytar'
import crypto from 'crypto'
import path from 'path'
import os from 'os'
import fs from 'fs'
import { execSync } from 'child_process'

// Check if Chrome is running
export function isChromeRunning() {
  try {
    const result = execSync('pgrep -x chrome || pgrep -x chromium || pgrep -x google-chrome', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    })
    return result.trim().length > 0
  } catch {
    return false
  }
}

// Get Chrome's encryption key from system keyring
async function getChromeKey() {
  // Try different possible service/account names
  const attempts = [
    ['chromium', 'Chromium Safe Storage'],
    ['chrome', 'Chrome Safe Storage'],
    ['chromium', 'Chrome Safe Storage'],
  ]

  for (const [service, account] of attempts) {
    try {
      const key = await keytar.getPassword(service, account)
      if (key) return key
    } catch {}
  }

  // Fallback: try to read from secret-tool directly
  try {
    const key = execSync(
      `secret-tool lookup application chrome 2>/dev/null || secret-tool lookup application chromium 2>/dev/null`,
      { encoding: 'utf8' }
    ).trim()
    if (key) return key
  } catch {}

  throw new Error('Could not find Chrome encryption key in system keyring')
}

// Derive the actual AES key from the password
function deriveKey(password) {
  return crypto.pbkdf2Sync(password, 'saltysalt', 1, 16, 'sha1')
}

// Decrypt a Chrome cookie value
function decryptCookie(encryptedValue, derivedKey) {
  if (!encryptedValue || encryptedValue.length < 4) {
    return null
  }

  // Check for v10/v11 prefix (encrypted)
  const prefix = encryptedValue.slice(0, 3).toString('utf8')
  if (prefix !== 'v10' && prefix !== 'v11') {
    // Not encrypted, return as-is
    return encryptedValue.toString('utf8')
  }

  try {
    const iv = Buffer.alloc(16, ' ')
    const data = encryptedValue.slice(3)

    const decipher = crypto.createDecipheriv('aes-128-cbc', derivedKey, iv)
    decipher.setAutoPadding(true)

    let decrypted = decipher.update(data)
    decrypted = Buffer.concat([decrypted, decipher.final()])

    return decrypted.toString('utf8')
  } catch (e) {
    console.error('Failed to decrypt cookie:', e.message)
    return null
  }
}

// Find Chrome's cookies file
function findChromeCookies() {
  const possiblePaths = [
    path.join(os.homedir(), '.config/google-chrome/Default/Cookies'),
    path.join(os.homedir(), '.config/chromium/Default/Cookies'),
    path.join(os.homedir(), '.config/google-chrome-beta/Default/Cookies'),
    path.join(os.homedir(), 'snap/chromium/common/chromium/Default/Cookies'),
  ]

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return p
    }
  }

  throw new Error('Chrome cookies file not found')
}

// Import Google/YouTube cookies from Chrome
export async function importChromeGoogleCookies(electronSession) {
  // Find cookies file
  const cookiesPath = findChromeCookies()
  console.log('Found Chrome cookies at:', cookiesPath)

  // Copy to temp file to avoid locking issues with running Chrome
  const tempPath = path.join(os.tmpdir(), `chrome-cookies-${Date.now()}.db`)
  fs.copyFileSync(cookiesPath, tempPath)
  console.log('Copied cookies to:', tempPath)

  // Get and derive encryption key
  const password = await getChromeKey()
  const derivedKey = deriveKey(password)
  console.log('Got Chrome encryption key')

  // Open database (read-only) from temp copy
  const db = new Database(tempPath, { readonly: true })

  // Query Google/YouTube cookies
  const cookies = db.prepare(`
    SELECT
      host_key,
      name,
      encrypted_value,
      path,
      expires_utc,
      is_secure,
      is_httponly,
      samesite
    FROM cookies
    WHERE host_key LIKE '%google%'
       OR host_key LIKE '%youtube%'
       OR host_key LIKE '%gstatic%'
  `).all()

  console.log(`Found ${cookies.length} Google/YouTube cookies`)

  let imported = 0
  let failed = 0

  for (const cookie of cookies) {
    const value = decryptCookie(cookie.encrypted_value, derivedKey)
    if (!value) {
      failed++
      continue
    }

    // Convert Chrome's expires_utc to JavaScript timestamp
    // Chrome uses microseconds since 1601-01-01
    const expirationDate = cookie.expires_utc
      ? (cookie.expires_utc / 1000000) - 11644473600
      : undefined

    // Determine the URL for setting the cookie
    const secure = cookie.is_secure === 1
    const protocol = secure ? 'https' : 'http'
    const host = cookie.host_key.startsWith('.')
      ? cookie.host_key.slice(1)
      : cookie.host_key
    const url = `${protocol}://${host}${cookie.path || '/'}`

    try {
      await electronSession.cookies.set({
        url,
        name: cookie.name,
        value,
        domain: cookie.host_key,
        path: cookie.path || '/',
        secure,
        httpOnly: cookie.is_httponly === 1,
        expirationDate,
        sameSite: cookie.samesite === 0 ? 'no_restriction' :
                  cookie.samesite === 1 ? 'lax' : 'strict'
      })
      imported++
    } catch (e) {
      console.error(`Failed to set cookie ${cookie.name}:`, e.message)
      failed++
    }
  }

  db.close()

  // Clean up temp file
  try {
    fs.unlinkSync(tempPath)
  } catch {}

  console.log(`Imported ${imported} cookies, ${failed} failed`)

  return { imported, failed, total: cookies.length }
}
