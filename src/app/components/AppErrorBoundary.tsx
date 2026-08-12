import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}
interface State {
  hasError: boolean;
}

// Last line of defence: without a boundary, any uncaught render error leaves a
// PWA user staring at a permanent white screen with no way to recover short of
// reinstalling. Data in localStorage is untouched by a render crash, so a
// reload almost always brings the app back.
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error('[app] render error', error);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 32,
          textAlign: 'center',
          backgroundColor: 'var(--bg-page)',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <div style={{ fontSize: 40, marginBottom: 12 }}>😵</div>
        <h1 style={{ color: 'var(--ink)', fontSize: 20, fontWeight: 700, margin: 0 }}>
          Something went wrong
        </h1>
        <p style={{ color: 'var(--ink-3)', fontSize: 15, lineHeight: 1.5, marginTop: 8, maxWidth: 300 }}>
          Sorry about that. Your data is safe - reloading usually fixes it.
        </p>
        <button
          onClick={() => window.location.reload()}
          style={{
            marginTop: 20,
            padding: '14px 32px',
            borderRadius: 12,
            border: 'none',
            backgroundColor: '#4F74F3',
            color: '#FFFFFF',
            fontSize: 16,
            fontWeight: 500,
          }}
        >
          Reload
        </button>
      </div>
    );
  }
}
