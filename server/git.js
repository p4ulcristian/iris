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
