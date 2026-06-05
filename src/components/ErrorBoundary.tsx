import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          height: '100vh', color: 'var(--text-primary)', textAlign: 'center', padding: 40
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>💥</div>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>应用出错了</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20, maxWidth: 400 }}>
            {this.state.error?.message || '未知错误'}
          </p>
          <button className="btn-primary" onClick={() => window.location.reload()}>
            重新加载
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
