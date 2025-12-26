import fs from 'fs'
import path from 'path'
import os from 'os'
import readline from 'readline'

// Get Claude projects directory
const CLAUDE_PROJECTS_DIR = path.join(os.homedir(), '.claude/projects')

// Convert a path to Claude's project folder name format
function pathToProjectFolder(projectPath) {
  // Claude uses format: -home-user-path (leading dash preserved)
  return projectPath.replace(/\//g, '-')
}

// Parse first user message from a session JSONL file
async function parseSessionFile(filePath) {
  const sessionId = path.basename(filePath, '.jsonl')
  const stats = fs.statSync(filePath)

  // Read file line by line
  const stream = fs.createReadStream(filePath)
  const rl = readline.createInterface({ input: stream })

  let firstUserMessage = null
  let cwd = null

  for await (const line of rl) {
    try {
      const entry = JSON.parse(line)

      // Look for user message type with actual content
      if (entry.type === 'user' && entry.message?.content) {
        const content = entry.message.content

        // Handle string content or array content
        let text = typeof content === 'string' ? content : null

        // If array, find text content
        if (Array.isArray(content)) {
          const textItem = content.find(c => typeof c === 'string' || c.type === 'text')
          text = typeof textItem === 'string' ? textItem : textItem?.text
        }

        if (text && !text.includes('tool_use_id')) {
          firstUserMessage = text
          cwd = entry.cwd || null
          break
        }
      }
    } catch {}
  }

  rl.close()
  stream.destroy()

  if (!firstUserMessage) return null

  // Truncate long messages
  const maxLen = 100
  const summary = firstUserMessage.length > maxLen
    ? firstUserMessage.slice(0, maxLen) + '...'
    : firstUserMessage

  // Remove god identity suffix if present
  const cleanSummary = summary.replace(/\n\nYou are \w+\. Voice: \w+\.?$/, '').trim()

  return {
    id: sessionId,
    summary: cleanSummary,
    timestamp: stats.mtime.toISOString(),
    cwd
  }
}

// List recent sessions for a project
export async function listSessions(projectPath, limit = 20) {
  const projectFolder = pathToProjectFolder(projectPath)
  const projectDir = path.join(CLAUDE_PROJECTS_DIR, projectFolder)

  if (!fs.existsSync(projectDir)) {
    return []
  }

  // Get all JSONL files, sorted by modification time (newest first)
  const files = fs.readdirSync(projectDir)
    .filter(f => f.endsWith('.jsonl') && !f.startsWith('agent-'))
    .map(f => ({
      path: path.join(projectDir, f),
      mtime: fs.statSync(path.join(projectDir, f)).mtime
    }))
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, limit * 2) // Get extra in case some fail to parse

  // Parse each file
  const sessions = []
  for (const file of files) {
    if (sessions.length >= limit) break

    const session = await parseSessionFile(file.path)
    if (session) {
      sessions.push(session)
    }
  }

  return sessions
}
