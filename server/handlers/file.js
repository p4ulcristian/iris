/**
 * File operation handlers.
 */

import fs from 'fs'
import path from 'path'

// Helper: Read directory tree recursively
async function readDirectoryTree(dirPath, maxDepth = 3, currentDepth = 0, showHidden = false) {
  const stats = await fs.promises.stat(dirPath)
  const name = path.basename(dirPath)

  if (!stats.isDirectory()) {
    return { name, path: dirPath, type: 'file' }
  }

  const node = { name, path: dirPath, type: 'directory', children: [] }

  if (currentDepth >= maxDepth) return node

  try {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true })
    entries.sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1
      if (!a.isDirectory() && b.isDirectory()) return 1
      return a.name.localeCompare(b.name)
    })

    const filtered = entries.filter(e => {
      if (['node_modules', '__pycache__', 'dist', 'build'].includes(e.name)) return false
      if (!showHidden && e.name.startsWith('.')) return false
      return true
    })

    for (const entry of filtered) {
      const childPath = path.join(dirPath, entry.name)
      if (entry.isDirectory()) {
        node.children.push(await readDirectoryTree(childPath, maxDepth, currentDepth + 1, showHidden))
      } else {
        node.children.push({ name: entry.name, path: childPath, type: 'file' })
      }
    }
  } catch (err) {
    console.error('Error reading directory:', err)
  }

  return node
}

export const handlers = {
  'file:list': (ws, data) => {
    const { id } = data
    const dirPath = data.path || process.env.HOME
    const showHidden = data.showHidden || false
    const maxDepth = data.maxDepth || 3
    console.log('[file:list] Request:', { id, dirPath, showHidden })

    readDirectoryTree(dirPath, maxDepth, 0, showHidden).then(tree => {
      console.log('[file:list] Sending response with id:', id)
      ws.send(JSON.stringify({ id, event: 'file:list', ok: true, tree }))
    }).catch(err => {
      console.error('[file:list] Error:', err)
      ws.send(JSON.stringify({ id, event: 'file:list', ok: false, error: err.message }))
    })
  },

  'file:children': (ws, data) => {
    const { id } = data
    const dirPath = data.path
    const showHidden = data.showHidden || false

    if (!dirPath) {
      ws.send(JSON.stringify({ id, event: 'file:children', ok: false, error: 'Missing path parameter' }))
      return
    }

    fs.promises.stat(dirPath).then(async stats => {
      if (!stats.isDirectory()) {
        ws.send(JSON.stringify({ id, event: 'file:children', ok: false, error: 'Path is not a directory' }))
        return
      }

      const entries = await fs.promises.readdir(dirPath, { withFileTypes: true })
      entries.sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1
        if (!a.isDirectory() && b.isDirectory()) return 1
        return a.name.localeCompare(b.name)
      })

      const filtered = entries.filter(e => {
        if (['node_modules', '__pycache__', 'dist', 'build'].includes(e.name)) return false
        if (!showHidden && e.name.startsWith('.')) return false
        return true
      })

      const children = filtered.map(entry => ({
        name: entry.name,
        path: path.join(dirPath, entry.name),
        type: entry.isDirectory() ? 'directory' : 'file',
        children: entry.isDirectory() ? [] : undefined
      }))

      ws.send(JSON.stringify({ id, event: 'file:children', ok: true, path: dirPath, children }))
    }).catch(err => {
      ws.send(JSON.stringify({ id, event: 'file:children', ok: false, path: dirPath, error: err.message }))
    })
  },

  'file:read': (ws, data) => {
    const { id } = data
    const filePath = data.path
    console.log('[file:read] Request:', { id, filePath })

    if (!filePath) {
      console.log('[file:read] Missing path')
      ws.send(JSON.stringify({ id, event: 'file:read', ok: false, error: 'Missing path parameter' }))
      return
    }

    fs.promises.readFile(filePath, 'utf-8').then(content => {
      console.log('[file:read] Success, sending response with id:', id)
      ws.send(JSON.stringify({ id, event: 'file:read', ok: true, content }))
    }).catch(err => {
      console.log('[file:read] Error:', err.message)
      ws.send(JSON.stringify({ id, event: 'file:read', ok: false, error: err.message }))
    })
  },

  'file:write': (ws, data) => {
    const { id } = data
    const filePath = data.path
    const content = data.content

    if (!filePath || content === undefined) {
      ws.send(JSON.stringify({ id, event: 'file:write', ok: false, error: 'Missing path or content' }))
      return
    }

    fs.promises.writeFile(filePath, content, 'utf-8').then(() => {
      ws.send(JSON.stringify({ id, event: 'file:write', ok: true }))
    }).catch(err => {
      ws.send(JSON.stringify({ id, event: 'file:write', ok: false, error: err.message }))
    })
  },

  'file:delete': (ws, data) => {
    const { id } = data
    const targetPath = data.path
    console.log('[file:delete] Request:', { id, targetPath })

    if (!targetPath) {
      console.log('[file:delete] Missing path')
      ws.send(JSON.stringify({ id, event: 'file:delete', ok: false, error: 'Missing path parameter' }))
      return
    }

    // Safety check: Don't allow deleting root or home directories
    const normalizedPath = path.normalize(targetPath)
    if (normalizedPath === '/' || normalizedPath === process.env.HOME) {
      console.log('[file:delete] Refusing to delete root or home directory')
      ws.send(JSON.stringify({ id, event: 'file:delete', ok: false, error: 'Cannot delete root or home directory' }))
      return
    }

    fs.promises.stat(targetPath).then(async stats => {
      if (stats.isDirectory()) {
        // Delete directory recursively
        await fs.promises.rm(targetPath, { recursive: true, force: true })
      } else {
        // Delete file
        await fs.promises.unlink(targetPath)
      }
      console.log('[file:delete] Success:', targetPath)
      ws.send(JSON.stringify({ id, event: 'file:delete', ok: true }))
    }).catch(err => {
      console.log('[file:delete] Error:', err.message)
      ws.send(JSON.stringify({ id, event: 'file:delete', ok: false, error: err.message }))
    })
  },
}
