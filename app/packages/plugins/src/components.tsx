import React from "react";
import { ErrorBoundary } from "@fiftyone/components";

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
