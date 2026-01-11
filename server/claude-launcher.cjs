#!/usr/bin/env node
// Launcher script for Claude - reads config from env vars
// This avoids all shell escaping issues

const launchStart = Date.now()
const T = () => `T+${Date.now() - launchStart}ms`
console.error(`[launcher] ${T()} Starting...`)

const { spawn } = require('child_process')
const { writeFileSync, unlinkSync } = require('fs')
const { join } = require('path')
const { tmpdir } = require('os')

// Permission mode handling (always set by gods.js, fallback to bypass for direct invocation)
const permissionMode = process.env.IRIS_PERMISSION_MODE || 'bypass'
const args = []

// Both modes use skip-permissions for full autonomy
if (permissionMode === 'bypass' || permissionMode === 'bypass-plan') {
  args.push('--dangerously-skip-permissions')
} else {
  // Fallback for any legacy values
  args.push('--dangerously-skip-permissions')
}

// For bypass-plan, append instruction to enter plan mode
if (permissionMode === 'bypass-plan' && process.env.IRIS_TASK) {
  process.env.IRIS_TASK = `${process.env.IRIS_TASK}\n\nBefore implementing, enter plan mode using the EnterPlanMode tool.`
}

let mcpTempFile = null

// Session handling
if (process.env.IRIS_RESUME === '1') {
  args.push('--resume', process.env.IRIS_SESSION_ID)
} else if (process.env.IRIS_SESSION_ID) {
  args.push('--session-id', process.env.IRIS_SESSION_ID)
}

// Personality/system prompt
// Use --system-prompt to REPLACE default prompt (skips CLAUDE.md reading)
// instead of --append-system-prompt which adds to it
if (process.env.IRIS_PERSONALITY) {
  args.push('--system-prompt', process.env.IRIS_PERSONALITY)
}

// Initial task/prompt - MUST come before --mcp-config (variadic arg)
if (process.env.IRIS_TASK) {
  args.push(process.env.IRIS_TASK)
}

// MCP config - write to temp file, pass file path (LAST - it's variadic)
// Use --strict-mcp-config to ignore project .mcp.json files
if (process.env.IRIS_MCP_CONFIG && process.env.IRIS_MCP_CONFIG.startsWith('{')) {
  mcpTempFile = join(tmpdir(), `iris-mcp-${Date.now()}.json`)
  writeFileSync(mcpTempFile, process.env.IRIS_MCP_CONFIG)
  args.push('--strict-mcp-config', '--mcp-config', mcpTempFile)
}

// Debug
console.error(`[launcher] ${T()} Mode: ${permissionMode}, MCP: ${mcpTempFile ? 'yes' : 'no'}, args: ${args.length}`)
console.error(`[launcher] ${T()} Spawning claude...`)

// Spawn claude with exact args - no shell
const child = spawn('claude', args, {
  stdio: 'inherit',
  env: process.env
})
console.error(`[launcher] ${T()} Claude spawned, PID: ${child.pid}`)

// Clean up temp file after Claude starts
if (mcpTempFile) {
  setTimeout(() => {
    try { unlinkSync(mcpTempFile) } catch {}
  }, 5000)
}

child.on('exit', (code) => process.exit(code || 0))
child.on('error', (err) => {
  console.error('Failed to start claude:', err.message)
  process.exit(1)
})
