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

  const node = { name, path: dirPath, type: 'directory', children: [], fileCount: 0, folderCount: 0 }

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

    // Count files and folders
    for (const entry of filtered) {
      if (entry.isDirectory()) {
        node.folderCount++
      } else {
        node.fileCount++
      }
    }

    // Only recurse into children if within depth limit
    if (currentDepth < maxDepth) {
      for (const entry of filtered) {
        const childPath = path.join(dirPath, entry.name)
        if (entry.isDirectory()) {
          node.children.push(await readDirectoryTree(childPath, maxDepth, currentDepth + 1, showHidden))
        } else {
          node.children.push({ name: entry.name, path: childPath, type: 'file' })
        }
      }
    }
  } catch (err) {
    // Error reading directory
  }

  return node
}

// Stats cache with TTL
const statsCache = new Map()
const CACHE_TTL = 30000 // 30 seconds

// Check if file is a text file for line counting
function isTextFile(filename) {
  const textExtensions = ['js', 'jsx', 'ts', 'tsx', 'py', 'json', 'md', 'css', 'html', 'yaml', 'yml', 'sh', 'clj', 'cljs', 'cljc', 'edn', 'txt', 'xml', 'svg', 'vue', 'scss', 'sass', 'less', 'sql', 'graphql', 'rs', 'go', 'java', 'kt', 'rb', 'php', 'c', 'cpp', 'h', 'hpp', 'swift', 'toml', 'ini', 'conf', 'env']
  const ext = filename.split('.').pop()?.toLowerCase()
  return textExtensions.includes(ext)
}

// Calculate folder stats recursively
async function calculateFolderStats(dirPath, showHidden = false) {
  let fileCount = 0
  let folderCount = 0
  let lineCount = 0
  let totalSize = 0

  try {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true })

    for (const entry of entries) {
      // Skip filtered entries
      if (['node_modules', '__pycache__', 'dist', 'build', '.git'].includes(entry.name)) continue
      if (!showHidden && entry.name.startsWith('.')) continue

      const fullPath = path.join(dirPath, entry.name)

      if (entry.isDirectory()) {
        folderCount++
        // Recurse into subdirectory
        const subStats = await calculateFolderStats(fullPath, showHidden)
        fileCount += subStats.fileCount
        folderCount += subStats.folderCount
        lineCount += subStats.lineCount
        totalSize += subStats.totalSize
      } else {
        fileCount++
        try {
          const stat = await fs.promises.stat(fullPath)
          totalSize += stat.size

          // Count lines for text files only (and limit file size to avoid reading huge files)
          if (isTextFile(entry.name) && stat.size < 1024 * 1024) { // Max 1MB
            const content = await fs.promises.readFile(fullPath, 'utf-8')
            lineCount += content.split('\n').length
          }
        } catch (err) {
          // Skip files we can't read
        }
      }
    }
  } catch (err) {
    // Permission denied or other error
  }

  return { fileCount, folderCount, lineCount, totalSize }
}

export const handlers = {
  'file:list': (ws, data) => {
    const { id } = data
    const dirPath = data.path || process.env.HOME
    const showHidden = data.showHidden || false
    const maxDepth = data.maxDepth || 3

    readDirectoryTree(dirPath, maxDepth, 0, showHidden).then(tree => {
      ws.send(JSON.stringify({ id, event: 'file:list', ok: true, tree }))
    }).catch(err => {
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

      // Build children with counts for folders
      const children = await Promise.all(filtered.map(async entry => {
        const childPath = path.join(dirPath, entry.name)

        if (entry.isDirectory()) {
          // Count files and folders in this directory
          let fileCount = 0
          let folderCount = 0

          try {
            const subEntries = await fs.promises.readdir(childPath, { withFileTypes: true })
            const subFiltered = subEntries.filter(e => {
              if (['node_modules', '__pycache__', 'dist', 'build'].includes(e.name)) return false
              if (!showHidden && e.name.startsWith('.')) return false
              return true
            })

            for (const sub of subFiltered) {
              if (sub.isDirectory()) folderCount++
              else fileCount++
            }
          } catch (err) {
            // Permission denied or other error - counts stay 0
          }

          return {
            name: entry.name,
            path: childPath,
            type: 'directory',
            children: [],
            fileCount,
            folderCount
          }
        } else {
          return { name: entry.name, path: childPath, type: 'file' }
        }
      }))

      ws.send(JSON.stringify({ id, event: 'file:children', ok: true, path: dirPath, children }))
    }).catch(err => {
      ws.send(JSON.stringify({ id, event: 'file:children', ok: false, path: dirPath, error: err.message }))
    })
  },

  'file:read': (ws, data) => {
    const { id } = data
    const filePath = data.path

    if (!filePath) {
      ws.send(JSON.stringify({ id, event: 'file:read', ok: false, error: 'Missing path parameter' }))
      return
    }

    fs.promises.readFile(filePath, 'utf-8').then(content => {
      ws.send(JSON.stringify({ id, event: 'file:read', ok: true, content }))
    }).catch(err => {
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

    if (!targetPath) {
      ws.send(JSON.stringify({ id, event: 'file:delete', ok: false, error: 'Missing path parameter' }))
      return
    }

    // Safety check: Don't allow deleting root or home directories
    const normalizedPath = path.normalize(targetPath)
    if (normalizedPath === '/' || normalizedPath === process.env.HOME) {
      ws.send(JSON.stringify({ id, event: 'file:delete', ok: false, error: 'Cannot delete root or home directory' }))
      return
    }

    fs.promises.stat(targetPath).then(async stats => {
      if (stats.isDirectory()) {
        await fs.promises.rm(targetPath, { recursive: true, force: true })
      } else {
        await fs.promises.unlink(targetPath)
      }
      ws.send(JSON.stringify({ id, event: 'file:delete', ok: true }))
    }).catch(err => {
      ws.send(JSON.stringify({ id, event: 'file:delete', ok: false, error: err.message }))
    })
  },

  'file:folder-stats': async (ws, data) => {
    const { id } = data
    const dirPath = data.path
    const showHidden = data.showHidden || false

    if (!dirPath) {
      ws.send(JSON.stringify({ id, event: 'file:folder-stats', ok: false, error: 'Missing path parameter' }))
      return
    }

    // Check cache
    const cacheKey = `${dirPath}:${showHidden}`
    const cached = statsCache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      ws.send(JSON.stringify({ id, event: 'file:folder-stats', ok: true, path: dirPath, stats: cached.stats }))
      return
    }

    try {
      const stats = await calculateFolderStats(dirPath, showHidden)

      // Cache result
      statsCache.set(cacheKey, { stats, timestamp: Date.now() })

      ws.send(JSON.stringify({ id, event: 'file:folder-stats', ok: true, path: dirPath, stats }))
    } catch (err) {
      ws.send(JSON.stringify({ id, event: 'file:folder-stats', ok: false, path: dirPath, error: err.message }))
    }
  },
}
