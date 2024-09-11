import { CenteredStack, scrollable } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import React, { useMemo } from "react";
import { useRecoilValue } from "recoil";
import { PANEL_LOADING_TIMEOUT } from "../constants";
import { PanelContext } from "../contexts";
import { useReactivePanel } from "../hooks";
import SpaceNode from "../SpaceNode";
import { PanelProps } from "../types";
import PanelNotFound from "./PanelNotFound";
import PanelSkeleton from "./PanelSkeleton";
import { StyledPanel } from "./StyledElements";

function ModalPanelComponent({
  component,
  node,
  dimensions,
}: {
  component: NonNullable<ReturnType<typeof useReactivePanel>>["component"];
  node: SpaceNode;
  dimensions: ReturnType<typeof fos.useDimensions>;
}) {
  const modalUniqueId = useRecoilValue(fos.currentModalUniqueId);

  const panelId = useMemo(() => `panel-${modalUniqueId}`, [modalUniqueId]);

  const ModalComponent = component;

  return (
    <ModalComponent panelNode={node} dimensions={dimensions} key={panelId} />
  );
}

function Panel(props: PanelProps) {
  const { node, isModalPanel } = props;
  const panelName = node.type as string;
  const panel = useReactivePanel(panelName);
  const dimensions = fos.useDimensions();
  const pending = fos.useTimeout(PANEL_LOADING_TIMEOUT);

  const panelContentTestId = `panel-content-${panelName}`;
  if (!panel) {
    return (
      <StyledPanel data-cy={panelContentTestId} $isModalPanel={isModalPanel}>
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
      <PanelContext.Provider value={{ node }}>
        {isModalPanel ? (
          <ModalPanelComponent
            component={panel.component}
            node={node}
            dimensions={dimensions}
          />
        ) : (
          <Component panelNode={node} dimensions={dimensions} />
        )}
      </PanelContext.Provider>
    </StyledPanel>
  );
}

export default React.memo(Panel, (prevProps, nextProps) => {
  return prevProps?.node?.id === nextProps?.node?.id;
});
