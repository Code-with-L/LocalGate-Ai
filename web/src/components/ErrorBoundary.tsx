import { Component, type ReactNode, type ErrorInfo } from "react";

interface ErrorBoundaryProps {
  readonly children: ReactNode;
}

interface ErrorBoundaryState {
  readonly error: Error | null;
}

/**
 * Per-route error boundary: a crash in one view must never take down the
 * whole shell, and the refusal reason must be visible, not swallowed.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Console only — no logging backend exists in P1 and none may be added.
    if (import.meta.env.DEV) {
      console.error("Route crashed:", error, info.componentStack);
    }
  }

  override render(): ReactNode {
    if (this.state.error != null) {
      return (
        <div className="lg-refused" role="alert">
          <p className="lg-refused__title">This view refused to render</p>
          <p className="lg-refused__body">{this.state.error.message}</p>
        </div>
      );
    }
    return this.props.children;
  }
}
