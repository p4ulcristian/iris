// Linear API client
// Set LINEAR_API_KEY environment variable to use

const LINEAR_API_URL = 'https://api.linear.app/graphql'

function getApiKey() {
  return process.env.LINEAR_API_KEY
}

async function graphql(query, variables = {}) {
  const apiKey = getApiKey()
  if (!apiKey) {
    throw new Error('LINEAR_API_KEY environment variable not set')
  }

  const response = await fetch(LINEAR_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': apiKey
    },
    body: JSON.stringify({ query, variables })
  })

  if (!response.ok) {
    throw new Error(`Linear API error: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()
  if (data.errors) {
    throw new Error(data.errors[0].message)
  }

  return data.data
}

export async function getMyIssues(limit = 50) {
  const query = `
    query MyIssues($limit: Int!) {
      viewer {
        assignedIssues(first: $limit, orderBy: updatedAt) {
          nodes {
            id
            identifier
            title
            description
            priority
            dueDate
            url
            branchName
            state {
              id
              name
              type
            }
            project {
              id
              name
            }
            team {
              id
              name
              key
            }
            labels {
              nodes {
                id
                name
                color
              }
            }
          }
        }
      }
    }
  `

  const data = await graphql(query, { limit })
  const issues = data.viewer.assignedIssues.nodes.map(issue => ({
    ...issue,
    labels: issue.labels?.nodes || []
  }))

  return issues
}

export async function getIssue(id) {
  const query = `
    query Issue($id: String!) {
      issue(id: $id) {
        id
        identifier
        title
        description
        priority
        dueDate
        url
        branchName
        state {
          id
          name
          type
        }
        project {
          id
          name
        }
        team {
          id
          name
          key
        }
        labels {
          nodes {
            id
            name
            color
          }
        }
        comments {
          nodes {
            id
            body
            createdAt
            user {
              id
              name
            }
          }
        }
      }
    }
  `

  const data = await graphql(query, { id })
  const issue = data.issue
  if (issue) {
    issue.labels = issue.labels?.nodes || []
    issue.comments = issue.comments?.nodes || []
  }
  return issue
}

export async function getTeams() {
  const query = `
    query Teams {
      teams {
        nodes {
          id
          name
          key
        }
      }
    }
  `
  const data = await graphql(query)
  return data.teams.nodes
}

export async function getStates(teamId) {
  const query = `
    query WorkflowStates($teamId: String!) {
      team(id: $teamId) {
        states {
          nodes {
            id
            name
            type
            color
            position
          }
        }
      }
    }
  `
  const data = await graphql(query, { teamId })
  return data.team.states.nodes.sort((a, b) => a.position - b.position)
}

export async function updateIssueStatus(issueId, stateId) {
  const mutation = `
    mutation UpdateIssue($issueId: String!, $stateId: String!) {
      issueUpdate(id: $issueId, input: { stateId: $stateId }) {
        success
        issue {
          id
          state {
            id
            name
            type
          }
        }
      }
    }
  `
  const data = await graphql(mutation, { issueId, stateId })
  return data.issueUpdate
}

export async function createIssue({ title, teamId, description, priority }) {
  const mutation = `
    mutation CreateIssue($title: String!, $teamId: String!, $description: String, $priority: Int) {
      issueCreate(input: {
        title: $title
        teamId: $teamId
        description: $description
        priority: $priority
      }) {
        success
        issue {
          id
          identifier
          title
          url
          state {
            id
            name
            type
          }
        }
      }
    }
  `
  const data = await graphql(mutation, { title, teamId, description, priority })
  return data.issueCreate
}

export async function addComment(issueId, body) {
  const mutation = `
    mutation AddComment($issueId: String!, $body: String!) {
      commentCreate(input: { issueId: $issueId, body: $body }) {
        success
        comment {
          id
          body
          createdAt
          user {
            id
            name
          }
        }
      }
    }
  `
  const data = await graphql(mutation, { issueId, body })
  return data.commentCreate
}

export function isConfigured() {
  return !!getApiKey()
}
