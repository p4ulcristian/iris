import { Component } from 'react'
import { reportError } from '../utils/error-reporter'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('React Error:', error, errorInfo)
    reportError(error, 'ErrorBoundary', {
      componentStack: errorInfo?.componentStack
    })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-screen bg-bg-primary text-text-primary p-8">
          <h1 className="text-2xl font-bold text-red-500 mb-4">Something went wrong</h1>
          <pre className="bg-bg-secondary p-4 rounded text-sm text-text-secondary max-w-2xl overflow-auto">
            {this.state.error?.message || 'Unknown error'}
          </pre>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="mt-4 px-4 py-2 bg-accent text-white rounded hover:bg-[#5a62e0]"
          >
            Try again
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
