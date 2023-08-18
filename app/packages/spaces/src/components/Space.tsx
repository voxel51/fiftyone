import { Allotment } from "allotment";
import "allotment/dist/style.css";
import { ReactSortable } from "react-sortablejs";
import { Layout } from "../enums";
import { useSpaces, usePanelTabAutoPosition } from "../hooks";
import SpaceNode from "../SpaceNode";
import { SpaceProps } from "../types";
import AddPanelButton from "./AddPanelButton";
import Panel from "./Panel";
import PanelTab from "./PanelTab";
import SplitPanelButton from "./SplitPanelButton";
import { PanelContainer, PanelTabs, SpaceContainer } from "./StyledElements";

export default function Space({ node, id }: SpaceProps) {
  const { spaces } = useSpaces(id);
  const autoPosition = usePanelTabAutoPosition();

  if (node.layout) {
    return (
      <SpaceContainer data-type="space-container">
        <Allotment vertical={node.layout === Layout.Vertical}>
          {node.children.map((space) => (
            <Allotment.Pane key={space.id}>
              <Space node={space} id={id} />
            </Allotment.Pane>
          ))}
        </Allotment>
      </SpaceContainer>
    );
  } else if (node.isPanelContainer() && node.hasChildren()) {
    const canSpaceSplit = spaces.canSplitLayout(node);
    let activeChild = node.getActiveChild();
    if (!activeChild && node.hasChildren()) {
      activeChild = node.firstChild();
      spaces.setNodeActive(activeChild);
    }
    return (
      <PanelContainer>
        <PanelTabs data-type="panel-container" data-cy="panel-container">
          <ReactSortable
            group="panel-tabs"
            list={node.children}
            filter=".sortable-ignore"
            setList={(children, _, dragging) => {
              if (dragging?.dragging !== null) {
                node.children = children;
                const parentNode = node.parent;
                if (node.hasChildren()) {
                  node.activeChild =
                    node.getActiveChild()?.id || node.firstChild().id;
                } else {
                  node.remove();
                  spaces.joinNode(parentNode as SpaceNode);
                }
                spaces.updateTree(node);
              }
            }}
            onChange={autoPosition}
            onEnd={autoPosition}
            style={{ display: "flex", width: "100%" }}
          >
            {node.children.map((child) => (
              <PanelTab
                key={child.id}
                node={child}
                active={activeChild?.id === child.id}
                spaceId={id}
              />
            ))}
            <div className="sortable-ignore" style={{ display: "flex" }}>
              <AddPanelButton node={node} spaceId={id} />
              {canSpaceSplit && (
                <>
                  <SplitPanelButton
                    node={node}
                    layout={Layout.Horizontal}
                    spaceId={id}
                  />
                  <SplitPanelButton
                    node={node}
                    layout={Layout.Vertical}
                    spaceId={id}
                  />
                </>
              )}
            </div>
          </ReactSortable>
        </PanelTabs>
        {node.hasActiveChild() ? (
          <Panel node={activeChild as SpaceNode} spaceId={id} />
        ) : null}
      </PanelContainer>
    );
  } else if (node.isPanel()) {
    return <Panel node={node} spaceId={id} />;
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
