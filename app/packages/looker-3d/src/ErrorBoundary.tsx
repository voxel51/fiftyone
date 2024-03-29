import { Loading } from "@fiftyone/components";
import React from "react";

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | string | null }
> {
  state = { error: null, hasError: false };

  static getDerivedStateFromError = (error: Error) => ({
    hasError: true,
    error,
  });

  componentDidCatch(error: Error) {
    this.setState({ error });
  }

  render() {
    if (this.state.hasError) {
      // useLoader from @react-three/fiber throws a raw string for PCD 404
      // not an error
      return (
        <Loading dataCy={"looker3d"}>
          <div data-cy="looker-error-info">
            {this.state.error instanceof Error
              ? this.state.error.message
              : this.state.error}
          </div>
        </Loading>
      );
    }

    return this.props.children;
  }
}
