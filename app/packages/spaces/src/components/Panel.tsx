import { PanelContext } from "../contexts";
import { usePanel, useSpaces } from "../hooks";
import { PanelProps } from "../types";
import { warnPanelNotFound } from "../utils";
import { StyledPanel } from "./StyledElements";
import React from "react";

function Panel({ node, spaceId }: PanelProps) {
  const { spaces } = useSpaces(spaceId);
  const panelName = node.type;
  const panel = usePanel(panelName);
  if (!panel) {
    spaces.removeNode(node);
    return warnPanelNotFound(panelName);
  }
  const { component: Component } = panel;
  return (
    <StyledPanel id={node.id}>
      <PanelContext.Provider value={{ node }}>
        <Component panelNode={node} />
      </PanelContext.Provider>
    </StyledPanel>
  );
}

export default React.memo(Panel, (prevProps, nextProps) => {
  return prevProps?.node?.id === nextProps?.node?.id;
});
