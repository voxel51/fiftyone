import { CenteredStack, scrollable } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import React from "react";
import { PANEL_LOADING_TIMEOUT } from "../constants";
import { PanelContext } from "../contexts";
import { useReactivePanel } from "../hooks";
import { PanelProps } from "../types";
import PanelNotFound from "./PanelNotFound";
import PanelSkeleton from "./PanelSkeleton";
import { StyledPanel } from "./StyledElements";

function Panel(props: PanelProps) {
  const { node } = props;
  const panelName = node.type as string;
  const panel = useReactivePanel(panelName);
  const dimensions = fos.useDimensions();
  const pending = fos.useTimeout(PANEL_LOADING_TIMEOUT);

  const panelContentTestId = `panel-content-${panelName}`;

  if (!panel) {
    return (
      <StyledPanel data-cy={panelContentTestId}>
        <CenteredStack>
          {pending ? (
            <PanelSkeleton />
          ) : (
            <PanelNotFound panelName={panelName} {...props} />
          )}
        </CenteredStack>
      </StyledPanel>
    );
  }

  const { component: Component } = panel;

  return (
    <StyledPanel
      id={node.id}
      data-cy={panelContentTestId}
      className={scrollable}
      ref={dimensions.ref}
    >
      <PanelContext.Provider value={{ node }}>
        <Component panelNode={node} dimensions={dimensions} />
      </PanelContext.Provider>
    </StyledPanel>
  );
}

export default React.memo(Panel, (prevProps, nextProps) => {
  return prevProps?.node?.id === nextProps?.node?.id;
});
