import React, { Component } from "react";
import { ErrorBoundary } from "@fiftyone/components";

interface PluginErrorBoundaryProps {
  children?: React.ReactNode;
}

interface PluginErrorBoundaryState {
  hasError: boolean;
}

class PluginErrorBoundary extends Component<
  PluginErrorBoundaryProps,
  PluginErrorBoundaryState
> {
  constructor(props: PluginErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }
  componentDidCatch(error, errorInfo) {
    console.error(error, errorInfo);
    this.setState({ hasError: true });
  }
  render() {
    if (this.state.hasError) {
      return <h1>Error</h1>;
    }
    return this.props.children;
  }
}

function PluginWrapper({ component, props }) {
  return (
    <ErrorBoundary disableReset={true}>
      {React.createElement(component, props)}
    </ErrorBoundary>
  );
}

export function wrapCustomComponent(customComponent) {
  return (props) => <PluginWrapper component={customComponent} props={props} />;
}
