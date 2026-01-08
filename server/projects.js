import fs from 'fs'
import path from 'path'
import os from 'os'

// User projects directory
const USER_PROJECTS_DIR = path.join(os.homedir(), '.config', 'iris', 'projects')

// Ensure directory exists
function ensureDir() {
  if (!fs.existsSync(USER_PROJECTS_DIR)) {
    fs.mkdirSync(USER_PROJECTS_DIR, { recursive: true })
  }
}

// List all projects
export function listProjects() {
  ensureDir()
  const projects = []

  for (const file of fs.readdirSync(USER_PROJECTS_DIR)) {
    if (file.endsWith('.json')) {
      const name = file.replace('.json', '')
      try {
        const content = fs.readFileSync(path.join(USER_PROJECTS_DIR, file), 'utf-8')
        const config = JSON.parse(content)
        projects.push({
          name,
          path: config.path || '',
          description: config.description || '',
          isDefault: config.isDefault || false
        })
      } catch (e) {
        console.error(`Failed to parse project ${file}:`, e.message)
      }
    }
  }

  return projects
}

// Load a project by name
export function loadProject(name) {
  const projectPath = path.join(USER_PROJECTS_DIR, `${name}.json`)
  if (fs.existsSync(projectPath)) {
    try {
      const content = fs.readFileSync(projectPath, 'utf-8')
      return JSON.parse(content)
    } catch (e) {
      console.error(`Failed to parse project ${name}:`, e.message)
    }
  }
  return null
}

// Save a project
export function saveProject(name, config) {
  ensureDir()
  const projectPath = path.join(USER_PROJECTS_DIR, `${name}.json`)
  fs.writeFileSync(projectPath, JSON.stringify(config, null, 2), 'utf-8')
  return projectPath
}

// Delete a project
export function deleteProject(name) {
  const projectPath = path.join(USER_PROJECTS_DIR, `${name}.json`)
  if (fs.existsSync(projectPath)) {
    fs.unlinkSync(projectPath)
    return true
  }
  return false
}

// Set a project as default (clears default from others)
export function setDefaultProject(name) {
  ensureDir()
  const projects = listProjects()

  for (const project of projects) {
    const projectPath = path.join(USER_PROJECTS_DIR, `${project.name}.json`)
    const config = loadProject(project.name)
    if (config) {
      config.isDefault = (project.name === name)
      fs.writeFileSync(projectPath, JSON.stringify(config, null, 2), 'utf-8')
    }
  }

  return true
}

// Get the default project
export function getDefaultProject() {
  const projects = listProjects()
  return projects.find(p => p.isDefault) || null
}

// Format projects for god prompt injection
export function getProjectsContext() {
  const projects = listProjects()
  if (projects.length === 0) return null

  const defaultProject = projects.find(p => p.isDefault)

  let context = '## Projects\n\nYou work on these projects:\n\n'
  context += '| Project | Path | Description |\n'
  context += '|---------|------|-------------|\n'

  for (const project of projects) {
    const isDefault = project.isDefault ? ' (default)' : ''
    const name = project.isDefault ? `**${project.name}**${isDefault}` : project.name
    const shortPath = project.path.replace(os.homedir(), '~')
    context += `| ${name} | ${shortPath} | ${project.description || '-'} |\n`
  }

  if (defaultProject) {
    context += `\n**Default project: ${defaultProject.name}**\n`
    context += `When I talk to you without specifying a project, assume it's about ${defaultProject.name}.\n`
  }

  return context
}
