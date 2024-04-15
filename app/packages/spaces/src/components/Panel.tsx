import { CenteredStack } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import { Typography } from "@mui/material";
import React from "react";
import { PANEL_LOADING_TIMEOUT } from "../constants";
import { PanelContext } from "../contexts";
import { useReactivePanel } from "../hooks";
import { PanelProps } from "../types";
import PanelSkeleton from "./PanelSkeleton";
import { StyledPanel } from "./StyledElements";

function Panel({ node }: PanelProps) {
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
            <Typography>
              Panel &quot;{panelName}&quot; no longer exists!
            </Typography>
          )}
        </CenteredStack>
      </StyledPanel>
    );
  }

  const { component: Component } = panel;

  return (
    <StyledPanel id={node.id} ref={dimensions.ref} data-cy={panelContentTestId}>
      <PanelContext.Provider value={{ node }}>
        <Component panelNode={node} dimensions={dimensions} />
      </PanelContext.Provider>
    </StyledPanel>
  );
}

export default React.memo(Panel, (prevProps, nextProps) => {
  return prevProps?.node?.id === nextProps?.node?.id;
});
