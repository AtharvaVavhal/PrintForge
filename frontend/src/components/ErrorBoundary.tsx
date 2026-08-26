import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { Button } from './ui/Button'
import styles from './ErrorBoundary.module.css'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
}

/**
 * Top-level render-error boundary (§18 Phase 1 item 6) — React error
 * boundaries must be class components; there is no hook equivalent.
 * Mounted once in main.tsx, outside every provider, so a crash inside
 * QueryClientProvider/AuthProvider/the router is caught too, not just a
 * crash inside a page.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // No frontend error-tracking integration exists yet — this is the last
    // resort until one does (backend has Sentry; frontend doesn't yet).
    console.error('Unhandled render error:', error, info.componentStack)
  }

  handleReload = (): void => {
    window.location.reload()
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className={styles.wrap}>
          <h1>Something went wrong</h1>
          <p>An unexpected error occurred. Try reloading the page.</p>
          <Button onClick={this.handleReload}>Reload</Button>
        </div>
      )
    }
    return this.props.children
  }
}
