/**
 * Git commit and push with auto-generated message.
 */

import { $ } from "bun"

function detectModule(filePaths: string[]): string {
  const patterns: Record<string, string | ((path: string) => string)> = {
    "features/flex/": "Flex",
    "features/auth/": "Auth",
    "features/": (p) => {
      const match = p.match(/features\/([^/]+)/)
      return match ? match[1].charAt(0).toUpperCase() + match[1].slice(1) : "Features"
    },
    "brain/skills/": (p) => {
      const match = p.match(/brain\/skills\/([^/]+)/)
      return match ? match[1].charAt(0).toUpperCase() + match[1].slice(1) + " Skill" : "Skills"
    },
    "brain/": "Brain",
    "cli/": "CLI",
    "config/": "Config",
    "shadows/": "Shadows",
    "prompts/": "Prompts",
    "app/": "App",
  }

  const counts: Record<string, number> = {}

  for (const path of filePaths) {
    for (const [pattern, module] of Object.entries(patterns)) {
      if (path.includes(pattern)) {
        const moduleName = typeof module === "function" ? module(path) : module
        counts[moduleName] = (counts[moduleName] || 0) + 1
        break
      }
    }
  }

  if (Object.keys(counts).length === 0) {
    return "Core"
  }

  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]
}

function generateCommitMessage(diffStat: string, issueId?: string): string {
  // Parse file paths from diff stat
  const filePaths: string[] = []
  for (const line of diffStat.split("\n")) {
    if (line.includes("|")) {
      const path = line.split("|")[0].trim()
      if (path) {
        filePaths.push(path)
      }
    }
  }

  const module = detectModule(filePaths)

  // Generate header
  const prefix = issueId ? `[${issueId} | ${module}]` : `[${module}]`

  // Generate description
  let description: string
  if (filePaths.length === 1) {
    const fileName = filePaths[0].split("/").pop()
    description = `Update ${fileName}`
  } else if (filePaths.every((p) => p.toLowerCase().includes("test"))) {
    description = "Update tests"
  } else if (filePaths.every((p) => p.endsWith(".md"))) {
    description = "Update documentation"
  } else if (filePaths.every((p) => /\.(yaml|json|toml)$/.test(p))) {
    description = "Update configuration"
  } else {
    description = `Update ${module.toLowerCase()} module`
  }

  // Truncate if needed
  let header = `${prefix} ${description}`
  if (header.length > 50) {
    const maxLen = 50 - prefix.length - 4
    description = description.slice(0, maxLen) + "..."
    header = `${prefix} ${description}`
  }

  // Generate body
  const bodyLines = filePaths.slice(0, 10).map((p) => {
    const fileName = p.split("/").pop()
    return `- Update ${fileName}`
  })

  if (filePaths.length > 10) {
    bodyLines.push(`- ... and ${filePaths.length - 10} more files`)
  }

  return `${header}\n\n${bodyLines.join("\n")}`
}

export async function push(args: string[]): Promise<number> {
  // Validate args
  let issueId: string | undefined

  if (args.length === 0) {
    // Just "push"
  } else if (args.length === 1 && /^[A-Z]+-\d+$/.test(args[0])) {
    issueId = args[0]
  } else {
    console.log("\x1b[33mUsage: iris push [ISSUE-ID]\x1b[0m")
    console.log("")
    console.log("Examples:")
    console.log("  iris push           # Commit without issue ID")
    console.log("  iris push IRO-123   # Commit with issue ID")
    return 1
  }

  // Check for staged changes
  const diffStat = await $`git diff --cached --stat`.text()

  if (!diffStat.trim()) {
    console.log("\x1b[33mNo staged changes to commit\x1b[0m")
    return 1
  }

  console.log("\x1b[36mStaged changes:\x1b[0m")
  console.log(diffStat)

  // Generate commit message
  const commitMsg = generateCommitMessage(diffStat, issueId)

  console.log("\n\x1b[36mCommit message:\x1b[0m")
  console.log(commitMsg)
  console.log()

  // Commit
  try {
    await $`git commit -m ${commitMsg}`.quiet()
  } catch (e) {
    console.error("\x1b[31mCommit failed\x1b[0m")
    return 1
  }

  // Get commit hash
  const commitHash = (await $`git rev-parse HEAD`.text()).trim().slice(0, 7)
  console.log(`\x1b[32mCommitted: ${commitHash}\x1b[0m`)

  // Push
  console.log("\n\x1b[36mPushing to remote...\x1b[0m")
  try {
    await $`git push`.quiet()
  } catch (e) {
    console.error("\x1b[31mPush failed\x1b[0m")
    return 1
  }

  console.log("\x1b[32m✓ Pushed successfully\x1b[0m")
  return 0
}
