import { spawn } from 'child_process'
import path from 'path'

function runGit(cwd, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn('git', args, { cwd })
    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (data) => { stdout += data.toString() })
    proc.stderr.on('data', (data) => { stderr += data.toString() })

    proc.on('close', (code) => {
      if (code === 0) {
        resolve(stdout)
      } else {
        reject(new Error(stderr || `git exited with code ${code}`))
      }
    })

    proc.on('error', reject)
  })
}

export async function getStatus(projectPath) {
  const output = await runGit(projectPath, ['status', '--porcelain', '-uall'])

  const staged = []
  const unstaged = []
  const untracked = []

  output.split('\n').filter(Boolean).forEach(line => {
    const index = line[0]
    const worktree = line[1]
    const file = line.slice(3)

    if (index === '?') {
      untracked.push({ file, status: 'untracked' })
    } else {
      if (index !== ' ' && index !== '?') {
        staged.push({ file, status: statusChar(index) })
      }
      if (worktree !== ' ' && worktree !== '?') {
        unstaged.push({ file, status: statusChar(worktree) })
      }
    }
  })

  return { staged, unstaged, untracked }
}

function statusChar(char) {
  const map = {
    'M': 'modified',
    'A': 'added',
    'D': 'deleted',
    'R': 'renamed',
    'C': 'copied',
    'U': 'unmerged'
  }
  return map[char] || 'unknown'
}

export async function getDiff(projectPath, file = null, ref1 = null, ref2 = null) {
  const args = ['diff', '--no-color']

  if (ref1 && ref2) {
    args.push(ref1, ref2)
  } else if (ref1) {
    args.push(ref1)
  }

  args.push('--')

  if (file) {
    args.push(file)
  }

  return await runGit(projectPath, args)
}

export async function getStagedDiff(projectPath, file = null) {
  const args = ['diff', '--cached', '--no-color', '--']

  if (file) {
    args.push(file)
  }

  return await runGit(projectPath, args)
}

export async function stageFiles(projectPath, files) {
  if (!files || files.length === 0) return

  await runGit(projectPath, ['add', '--', ...files])
}

export async function unstageFiles(projectPath, files) {
  if (!files || files.length === 0) return

  await runGit(projectPath, ['restore', '--staged', '--', ...files])
}

export async function discardChanges(projectPath, files) {
  if (!files || files.length === 0) return

  await runGit(projectPath, ['checkout', '--', ...files])
}

export async function getCommits(projectPath, limit = 50) {
  const format = '%H%x00%h%x00%s%x00%an%x00%ae%x00%ai%x00%P'
  const output = await runGit(projectPath, [
    'log',
    `--format=${format}`,
    `-n${limit}`,
    '--all'
  ])

  return output.split('\n').filter(Boolean).map(line => {
    const [hash, short, subject, author, email, date, parents] = line.split('\x00')
    return {
      hash,
      short,
      subject,
      author,
      email,
      date,
      parents: parents ? parents.split(' ') : []
    }
  })
}

export async function getBranches(projectPath) {
  const output = await runGit(projectPath, ['branch', '-a', '--format=%(refname:short)'])
  return output.split('\n').filter(Boolean)
}

export async function getCurrentBranch(projectPath) {
  const output = await runGit(projectPath, ['branch', '--show-current'])
  return output.trim()
}

export function getProjectName(projectPath) {
  return path.basename(projectPath)
}

export async function isGitRepo(projectPath) {
  try {
    await runGit(projectPath, ['rev-parse', '--git-dir'])
    return true
  } catch {
    return false
  }
}

export async function getAheadBehind(projectPath) {
  try {
    const branch = await getCurrentBranch(projectPath)
    if (!branch) return { ahead: 0, behind: 0 }

    // Check if upstream exists
    try {
      await runGit(projectPath, ['rev-parse', '--abbrev-ref', `${branch}@{upstream}`])
    } catch {
      return { ahead: 0, behind: 0, noUpstream: true }
    }

    const output = await runGit(projectPath, ['rev-list', '--left-right', '--count', `${branch}...${branch}@{upstream}`])
    const [ahead, behind] = output.trim().split(/\s+/).map(Number)
    return { ahead: ahead || 0, behind: behind || 0 }
  } catch {
    return { ahead: 0, behind: 0 }
  }
}

export async function commit(projectPath, message, amend = false) {
  const args = ['commit', '-m', message]
  if (amend) args.push('--amend')
  return await runGit(projectPath, args)
}

export async function push(projectPath, remote = 'origin', branch = null, force = false) {
  const args = ['push', remote]
  if (branch) args.push(branch)
  if (force) args.push('--force')
  return await runGit(projectPath, args)
}

export async function pull(projectPath, remote = 'origin', branch = null, rebase = false) {
  const args = ['pull', remote]
  if (branch) args.push(branch)
  if (rebase) args.push('--rebase')
  return await runGit(projectPath, args)
}

export async function fetch(projectPath, remote = '--all') {
  return await runGit(projectPath, ['fetch', remote])
}

export async function checkout(projectPath, ref) {
  return await runGit(projectPath, ['checkout', ref])
}

export async function createBranch(projectPath, name, startPoint = null) {
  const args = ['checkout', '-b', name]
  if (startPoint) args.push(startPoint)
  return await runGit(projectPath, args)
}

export async function deleteBranch(projectPath, name, force = false) {
  const args = ['branch', force ? '-D' : '-d', name]
  return await runGit(projectPath, args)
}

export async function stashList(projectPath) {
  try {
    const output = await runGit(projectPath, ['stash', 'list', '--format=%gd%x00%s%x00%ai'])
    return output.split('\n').filter(Boolean).map(line => {
      const [ref, message, date] = line.split('\x00')
      return { ref, message, date }
    })
  } catch {
    return []
  }
}

export async function stashCreate(projectPath, message = null) {
  const args = ['stash', 'push']
  if (message) args.push('-m', message)
  return await runGit(projectPath, args)
}

export async function stashApply(projectPath, index = 0) {
  return await runGit(projectPath, ['stash', 'apply', `stash@{${index}}`])
}

export async function stashPop(projectPath, index = 0) {
  return await runGit(projectPath, ['stash', 'pop', `stash@{${index}}`])
}

export async function stashDrop(projectPath, index = 0) {
  return await runGit(projectPath, ['stash', 'drop', `stash@{${index}}`])
}

export async function getRemotes(projectPath) {
  try {
    const output = await runGit(projectPath, ['remote', '-v'])
    const remotes = {}
    output.split('\n').filter(Boolean).forEach(line => {
      const match = line.match(/^(\S+)\s+(\S+)\s+\((\w+)\)$/)
      if (match) {
        const [, name, url, type] = match
        if (!remotes[name]) remotes[name] = {}
        remotes[name][type] = url
      }
    })
    return Object.entries(remotes).map(([name, urls]) => ({ name, ...urls }))
  } catch {
    return []
  }
}

export async function getCommitDetails(projectPath, hash) {
  const format = '%H%x00%s%x00%b%x00%an%x00%ae%x00%ai%x00%P'
  const output = await runGit(projectPath, ['show', '--format=' + format, '-s', hash])
  const [fullHash, subject, body, author, email, date, parents] = output.trim().split('\x00')

  // Get changed files
  const filesOutput = await runGit(projectPath, ['diff-tree', '--no-commit-id', '--name-status', '-r', hash])
  const files = filesOutput.split('\n').filter(Boolean).map(line => {
    const [status, ...pathParts] = line.split('\t')
    return { status: statusChar(status), file: pathParts.join('\t') }
  })

  return {
    hash: fullHash,
    subject,
    body: body.trim(),
    author,
    email,
    date,
    parents: parents ? parents.split(' ') : [],
    files
  }
}

export async function getCommitDiff(projectPath, hash, file = null) {
  const args = ['show', '--no-color', hash]
  if (file) args.push('--', file)
  return await runGit(projectPath, args)
}
