import { Resizable } from "re-resizable";
import { Fragment } from "react";
import { Layout } from "../enums";
import { useSpaces } from "../hooks";
import SpaceNode from "../SpaceNode";
import { SpaceProps } from "../types";
import AddPanelButton from "./AddPanelButton";
import Panel from "./Panel";
import PanelTab from "./PanelTab";
import SplitPanelButton from "./SplitPanelButton";
import { PanelContainer, PanelTabs, SpaceContainer } from "./StyledElements";

export default function Space({ node, id }: SpaceProps) {
  const { spaces } = useSpaces(id);

  if (node.layout) {
    return (
      <SpaceContainer data-type="space-container">
        {node.children.map((space, i) => {
          const Wrapper = i === 0 ? Fragment : Resizable;
          const wrapperProps = i === 0 ? {} : { enable: { left: true } };
          return (
            <Wrapper {...wrapperProps}>
              <Space node={space} id={id} />
            </Wrapper>
          );
        })}
      </SpaceContainer>
    );
  } else if (node.isPanelContainer() && node.hasChildren()) {
    const canSpaceSplit = spaces.canSplitLayout(node);
    const activeChild = node.getActiveChild();
    return (
      <PanelContainer data-type="panel-container">
        <PanelTabs>
          {node.children.map((child, index) => (
            <PanelTab
              key={child.id}
              node={child}
              active={activeChild?.id === child.id}
              spaceId={id}
            />
          ))}
          <AddPanelButton node={node} spaceId={id} />
          {canSpaceSplit && (
            <SplitPanelButton
              node={node}
              layout={Layout.Vertical}
              spaceId={id}
            />
          )}
        </PanelTabs>
        {node.hasActiveChild() ? (
          <Panel node={activeChild as SpaceNode} />
        ) : null}
      </PanelContainer>
    );
  } else if (node.isPanel()) {
    return <Panel node={node} />;
  } else if (node.isEmpty()) {
    return (
      <PanelContainer data-type="panel-container">
        <PanelTabs>
          <AddPanelButton node={node} spaceId={id} />
        </PanelTabs>
      </PanelContainer>
    );
  }
  return null;
}
