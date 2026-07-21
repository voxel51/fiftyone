import React, { type ReactNode } from "react";

interface AssetErrorBoundaryProps {
  children: ReactNode;
  resetKey?: unknown;
}

interface AssetErrorBoundaryState {
  hasError: boolean;
}

/** Isolates asset failures and retries when the asset identity changes. */
export class AssetErrorBoundary extends React.Component<
  AssetErrorBoundaryProps,
  AssetErrorBoundaryState
> {
  state = { hasError: false };

  static getDerivedStateFromError(error: unknown) {
    console.error(error);
    return { hasError: true };
  }

  componentDidUpdate(previousProps: AssetErrorBoundaryProps) {
    if (this.state.hasError && previousProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (this.state.hasError) {
      // todo: add indicator in canvas that asset failed loading
      return null;
    }

    return this.props.children;
  }
}
