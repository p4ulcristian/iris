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

export function isConfigured() {
  return !!getApiKey()
}
