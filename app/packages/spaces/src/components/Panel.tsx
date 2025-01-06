import { CenteredStack, scrollable } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import React, { useEffect } from "react";
import { useSetRecoilState } from "recoil";
import { PANEL_LOADING_TIMEOUT } from "../constants";
import { PanelContext } from "../contexts";
import { useReactivePanel } from "../hooks";
import { panelIdToScopeAtom } from "../state";
import { PanelProps } from "../types";
import PanelNotFound from "./PanelNotFound";
import PanelSkeleton from "./PanelSkeleton";
import { StyledPanel } from "./StyledElements";

function Panel(props: PanelProps) {
  const { node, isModalPanel } = props;
  const panelName = node.type as string;
  const panel = useReactivePanel(panelName);
  const dimensions = fos.useDimensions();
  const pending = fos.useTimeout(PANEL_LOADING_TIMEOUT);
  const setPanelIdToScope = useSetRecoilState(panelIdToScopeAtom);
  const scope = isModalPanel ? "modal" : "grid";

  useEffect(() => {
    setPanelIdToScope((ids) => ({ ...ids, [node.id]: scope }));
  }, [scope, setPanelIdToScope, node.id]);

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
      $isModalPanel={isModalPanel}
      id={node.id}
      data-cy={panelContentTestId}
      className={scrollable}
      ref={dimensions.ref}
    >
      <PanelContext.Provider value={{ node, scope }}>
        <Component panelNode={node} dimensions={dimensions} />
      </PanelContext.Provider>
    </StyledPanel>
  );
}

export default React.memo(Panel, (prevProps, nextProps) => {
  return prevProps?.node?.id === nextProps?.node?.id;
});
