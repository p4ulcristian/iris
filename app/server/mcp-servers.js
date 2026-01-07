import fs from 'fs'
import path from 'path'
import os from 'os'
import { MCP_SERVERS_DIR } from './config.js'

// User MCP servers directory
const USER_MCP_SERVERS_DIR = path.join(os.homedir(), '.config', 'iris', 'mcp-servers')

// List all available MCP servers (user + bundled, user takes priority)
export function listMcpServers() {
  const servers = new Map()

  // Load bundled servers first
  if (MCP_SERVERS_DIR && fs.existsSync(MCP_SERVERS_DIR)) {
    for (const file of fs.readdirSync(MCP_SERVERS_DIR)) {
      if (file.endsWith('.json')) {
        const name = file.replace('.json', '')
        try {
          const content = fs.readFileSync(path.join(MCP_SERVERS_DIR, file), 'utf-8')
          const config = JSON.parse(content)
          servers.set(name, {
            name,
            description: config.description || '',
            path: path.join(MCP_SERVERS_DIR, file),
            source: 'bundled',
            config
          })
        } catch (e) {
          console.error(`Failed to load bundled MCP server ${name}:`, e)
        }
      }
    }
  }

  // User servers override bundled
  if (fs.existsSync(USER_MCP_SERVERS_DIR)) {
    for (const file of fs.readdirSync(USER_MCP_SERVERS_DIR)) {
      if (file.endsWith('.json')) {
        const name = file.replace('.json', '')
        try {
          const content = fs.readFileSync(path.join(USER_MCP_SERVERS_DIR, file), 'utf-8')
          const config = JSON.parse(content)
          servers.set(name, {
            name,
            description: config.description || '',
            path: path.join(USER_MCP_SERVERS_DIR, file),
            source: 'user',
            config
          })
        } catch (e) {
          console.error(`Failed to load user MCP server ${name}:`, e)
        }
      }
    }
  }

  return Array.from(servers.values())
}

// Load an MCP server config by name (user version takes priority over bundled)
export function loadMcpServer(name) {
  if (!name) return null

  // Check user directory first
  const userPath = path.join(USER_MCP_SERVERS_DIR, `${name}.json`)
  if (fs.existsSync(userPath)) {
    try {
      const content = fs.readFileSync(userPath, 'utf-8')
      return JSON.parse(content)
    } catch (e) {
      console.error(`Failed to parse user MCP server ${name}:`, e)
    }
  }

  // Fall back to bundled
  if (MCP_SERVERS_DIR) {
    const bundledPath = path.join(MCP_SERVERS_DIR, `${name}.json`)
    if (fs.existsSync(bundledPath)) {
      try {
        const content = fs.readFileSync(bundledPath, 'utf-8')
        return JSON.parse(content)
      } catch (e) {
        console.error(`Failed to parse bundled MCP server ${name}:`, e)
      }
    }
  }

  return null
}

// Save an MCP server to user directory
export function saveMcpServer(name, config) {
  // Ensure directory exists
  if (!fs.existsSync(USER_MCP_SERVERS_DIR)) {
    fs.mkdirSync(USER_MCP_SERVERS_DIR, { recursive: true })
  }

  const serverPath = path.join(USER_MCP_SERVERS_DIR, `${name}.json`)
  fs.writeFileSync(serverPath, JSON.stringify(config, null, 2), 'utf-8')
  return serverPath
}

// Delete a user MCP server
export function deleteMcpServer(name) {
  const serverPath = path.join(USER_MCP_SERVERS_DIR, `${name}.json`)
  if (fs.existsSync(serverPath)) {
    fs.unlinkSync(serverPath)
    return true
  }
  return false
}

// Get MCP server info
export function getMcpServerInfo(name) {
  const servers = listMcpServers()
  return servers.find(s => s.name === name) || null
}

// Compose MCP config for Claude --mcp-config flag
// Returns a JSON object with mcpServers key
export function composeMcpConfig(serverNames, irisRoot = null) {
  if (!serverNames || serverNames.length === 0) {
    return null
  }

  const mcpServers = {}

  for (const name of serverNames) {
    const config = loadMcpServer(name)
    if (config) {
      // Build the server config for Claude
      const serverConfig = {
        command: config.command,
        args: config.args || []
      }

      // Handle relative paths - set cwd for the MCP server
      // Don't modify command (it's usually a system binary like uv, node)
      if (config.relative && irisRoot) {
        serverConfig.cwd = irisRoot
      }

      // Add env if present
      if (config.env) {
        serverConfig.env = config.env
      }

      mcpServers[name] = serverConfig
    }
  }

  if (Object.keys(mcpServers).length === 0) {
    return null
  }

  return { mcpServers }
}
