import React from "react";

type ErrorBoundaryProps = {
  fallback: React.ReactNode;
  children: React.ReactNode;
} & any;

export class ErrorBoundary extends React.Component<ErrorBoundaryProps> {
  state: { error?: Error };

  constructor(
    props: React.ComponentProps<
      {
        fallback: React.ReactNode;
        children: React.ReactNode;
      } & any
    >
  ) {
    super(props);
    this.state = {};
  }

  render() {
    return this.state.error ? this.props.fallback : this.props.children;
  }

  static getDerivedStateFromError(error: Error) {
    return {
      error,
    };
  }
}
