/**
 * Configuration handlers for personalities, traits, MCP servers, and projects.
 */

import * as personalities from '../personalities.js'
import * as traits from '../traits.js'
import * as mcpServers from '../mcp-servers.js'
import * as projects from '../projects.js'
import { DEFAULT_PERMISSION_MODE } from '../config.js'

export const handlers = {
  // ==================== PERSONALITIES ====================

  'personalities:list': (ws) => {
    const allPersonalities = personalities.listPersonalities()
    const personalitiesWithPreview = allPersonalities.map(p => ({
      ...p,
      preview: p.traits.length > 0 ? `Traits: ${p.traits.join(', ')}` : 'No traits enabled'
    }))
    ws.send(JSON.stringify({
      event: 'personalities:list:response',
      personalities: personalitiesWithPreview,
      defaults: {
        permissionMode: DEFAULT_PERMISSION_MODE
      }
    }))
  },

  'personalities:get': (ws, data) => {
    const { name } = data
    if (!name) {
      ws.send(JSON.stringify({ event: 'personalities:error', error: 'Personality name required' }))
      return
    }

    const loaded = personalities.loadPersonality(name)
    if (!loaded) {
      ws.send(JSON.stringify({ event: 'personalities:error', error: `Personality "${name}" not found` }))
      return
    }

    const info = personalities.getPersonalityInfo(name)

    ws.send(JSON.stringify({
      event: 'personalities:get:response',
      name,
      type: 'traits',
      config: loaded.config,
      source: info?.source || 'unknown'
    }))
  },

  'personalities:save': (ws, data) => {
    const { name, config } = data
    if (!name) {
      ws.send(JSON.stringify({ event: 'personalities:error', error: 'Personality name required' }))
      return
    }

    if (!config) {
      ws.send(JSON.stringify({ event: 'personalities:error', error: 'Personality config required' }))
      return
    }

    try {
      const savedPath = personalities.savePersonality(name, config)
      ws.send(JSON.stringify({
        event: 'personalities:save:response',
        name,
        path: savedPath,
        source: 'user'
      }))
    } catch (err) {
      ws.send(JSON.stringify({ event: 'personalities:error', error: err.message }))
    }
  },

  'personalities:delete': (ws, data) => {
    const { name } = data
    if (!name) {
      ws.send(JSON.stringify({ event: 'personalities:error', error: 'Personality name required' }))
      return
    }

    const deleted = personalities.deletePersonality(name)
    if (!deleted) {
      ws.send(JSON.stringify({ event: 'personalities:error', error: `Could not delete personality "${name}"` }))
      return
    }

    ws.send(JSON.stringify({
      event: 'personalities:delete:response',
      name
    }))
  },

  // ==================== TRAITS ====================

  'traits:list': (ws) => {
    const allTraits = traits.listTraits()
    const traitsWithPreview = allTraits.map(t => {
      const content = traits.loadTrait(t.name)
      const lines = content ? content.split('\n').filter(l => l.trim()).slice(0, 2) : []
      return {
        ...t,
        preview: lines.join('\n').substring(0, 100)
      }
    })
    ws.send(JSON.stringify({
      event: 'traits:list:response',
      traits: traitsWithPreview
    }))
  },

  'traits:get': (ws, data) => {
    const { name } = data
    if (!name) {
      ws.send(JSON.stringify({ event: 'traits:error', error: 'Trait name required' }))
      return
    }

    const content = traits.loadTrait(name)
    if (!content) {
      ws.send(JSON.stringify({ event: 'traits:error', error: `Trait "${name}" not found` }))
      return
    }

    const info = traits.getTraitInfo(name)
    ws.send(JSON.stringify({
      event: 'traits:get:response',
      name,
      content,
      source: info?.source || 'unknown'
    }))
  },

  'traits:save': (ws, data) => {
    const { name, content } = data
    if (!name || content === undefined) {
      ws.send(JSON.stringify({ event: 'traits:error', error: 'Trait name and content required' }))
      return
    }

    try {
      const savedPath = traits.saveTrait(name, content)
      ws.send(JSON.stringify({
        event: 'traits:save:response',
        name,
        path: savedPath,
        source: 'user'
      }))
    } catch (err) {
      ws.send(JSON.stringify({ event: 'traits:error', error: err.message }))
    }
  },

  'traits:delete': (ws, data) => {
    const { name } = data
    if (!name) {
      ws.send(JSON.stringify({ event: 'traits:error', error: 'Trait name required' }))
      return
    }

    const deleted = traits.deleteTrait(name)
    if (!deleted) {
      ws.send(JSON.stringify({ event: 'traits:error', error: `Could not delete trait "${name}"` }))
      return
    }

    ws.send(JSON.stringify({
      event: 'traits:delete:response',
      name
    }))
  },

  // ==================== MCP SERVERS ====================

  'mcp-servers:list': (ws) => {
    const allServers = mcpServers.listMcpServers()
    ws.send(JSON.stringify({
      event: 'mcp-servers:list:response',
      servers: allServers
    }))
  },

  'mcp-servers:get': (ws, data) => {
    const { name } = data
    if (!name) {
      ws.send(JSON.stringify({ event: 'mcp-servers:error', error: 'MCP server name required' }))
      return
    }

    const config = mcpServers.loadMcpServer(name)
    if (!config) {
      ws.send(JSON.stringify({ event: 'mcp-servers:error', error: `MCP server "${name}" not found` }))
      return
    }

    const info = mcpServers.getMcpServerInfo(name)
    ws.send(JSON.stringify({
      event: 'mcp-servers:get:response',
      name,
      config,
      source: info?.source || 'unknown'
    }))
  },

  'mcp-servers:save': (ws, data) => {
    const { name, config } = data
    if (!name || !config) {
      ws.send(JSON.stringify({ event: 'mcp-servers:error', error: 'MCP server name and config required' }))
      return
    }

    try {
      const savedPath = mcpServers.saveMcpServer(name, config)
      ws.send(JSON.stringify({
        event: 'mcp-servers:save:response',
        name,
        path: savedPath,
        source: 'user'
      }))
    } catch (err) {
      ws.send(JSON.stringify({ event: 'mcp-servers:error', error: err.message }))
    }
  },

  'mcp-servers:delete': (ws, data) => {
    const { name } = data
    if (!name) {
      ws.send(JSON.stringify({ event: 'mcp-servers:error', error: 'MCP server name required' }))
      return
    }

    const deleted = mcpServers.deleteMcpServer(name)
    if (!deleted) {
      ws.send(JSON.stringify({ event: 'mcp-servers:error', error: `Could not delete MCP server "${name}"` }))
      return
    }

    ws.send(JSON.stringify({
      event: 'mcp-servers:delete:response',
      name
    }))
  },

  // ==================== PROJECTS ====================

  'projects:list': (ws) => {
    const allProjects = projects.listProjects()
    ws.send(JSON.stringify({
      event: 'projects:list:response',
      projects: allProjects
    }))
  },

  'projects:get': (ws, data) => {
    const { name } = data
    if (!name) {
      ws.send(JSON.stringify({ event: 'projects:error', error: 'Project name required' }))
      return
    }

    const project = projects.loadProject(name)
    if (!project) {
      ws.send(JSON.stringify({ event: 'projects:error', error: `Project "${name}" not found` }))
      return
    }

    ws.send(JSON.stringify({
      event: 'projects:get:response',
      name,
      ...project
    }))
  },

  'projects:save': (ws, data) => {
    const { name, path: projectPath, description, isDefault } = data
    if (!name) {
      ws.send(JSON.stringify({ event: 'projects:error', error: 'Project name required' }))
      return
    }

    if (!projectPath) {
      ws.send(JSON.stringify({ event: 'projects:error', error: 'Project path required' }))
      return
    }

    try {
      const config = {
        path: projectPath,
        description: description || '',
        isDefault: isDefault || false
      }
      const savedPath = projects.saveProject(name, config)
      ws.send(JSON.stringify({
        event: 'projects:save:response',
        name,
        path: savedPath
      }))
    } catch (err) {
      ws.send(JSON.stringify({ event: 'projects:error', error: err.message }))
    }
  },

  'projects:delete': (ws, data) => {
    const { name } = data
    if (!name) {
      ws.send(JSON.stringify({ event: 'projects:error', error: 'Project name required' }))
      return
    }

    const deleted = projects.deleteProject(name)
    if (!deleted) {
      ws.send(JSON.stringify({ event: 'projects:error', error: `Could not delete project "${name}"` }))
      return
    }

    ws.send(JSON.stringify({
      event: 'projects:delete:response',
      name
    }))
  },

  'projects:setDefault': (ws, data) => {
    const { name } = data
    if (!name) {
      ws.send(JSON.stringify({ event: 'projects:error', error: 'Project name required' }))
      return
    }

    projects.setDefaultProject(name)
    ws.send(JSON.stringify({
      event: 'projects:setDefault:response',
      name
    }))
  },
}
