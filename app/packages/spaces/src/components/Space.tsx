import { Allotment, AllotmentHandle } from "allotment";
import "allotment/dist/style.css";
import { debounce } from "lodash";
import { useEffect, useMemo, useRef } from "react";
import { ReactSortable } from "react-sortablejs";
import SpaceNode from "../SpaceNode";
import { Layout } from "../enums";
import { usePanelTabAutoPosition, useSpaces } from "../hooks";
import { SpaceProps } from "../types";
import {
  getAbsoluteSizes,
  getRelativeSizes,
  toPercentage,
} from "../utils/sizes";
import AddPanelButton from "./AddPanelButton";
import Panel from "./Panel";
import PanelTab from "./PanelTab";
import SavedSpaces from "./SavedSpaces";
import SplitPanelButton from "./SplitPanelButton";
import { PanelContainer, PanelTabs, SpaceContainer } from "./StyledElements";

export default function Space({ node, id }: SpaceProps) {
  const { spaces } = useSpaces(id);
  const autoPosition = usePanelTabAutoPosition();
  const spaceRef = useRef<AllotmentHandle>(null);
  const previousSizesRef = useRef<number[]>();
  const currentTotalSize = useRef<number>();
  const { sizes } = node;

  const setSpaceSizes = useMemo(() => {
    return debounce((node: SpaceNode, sizes: number[]) => {
      currentTotalSize.current = sizes.reduce((total, item) => total + item, 0);
      const relativeSizes = getRelativeSizes(sizes);
      previousSizesRef.current = relativeSizes;
      spaces.setNodeSizes(node, relativeSizes);
    }, 500);
  }, [spaces]);

  // apply sizes updates from remote session
  useEffect(() => {
    const lastSizes = previousSizesRef.current?.toString();
    const currentSizes = sizes?.toString();
    const totalSize = currentTotalSize.current;
    if (lastSizes && totalSize && sizes && lastSizes !== currentSizes) {
      spaceRef.current?.resize(getAbsoluteSizes(sizes, totalSize));
    }
    previousSizesRef.current = sizes;
  }, [sizes]);

  if (node.layout) {
    return (
      <SpaceContainer data-type="space-container">
        {node.isRoot() && <SavedSpaces />}
        <Allotment
          key={node.layout}
          vertical={node.layout === Layout.Vertical}
          onReset={() => {
            // todo: support more than two panel per space
            spaceRef.current?.resize([0, 0]);
          }}
          onChange={(sizes) => {
            setSpaceSizes(node, sizes);
          }}
          ref={spaceRef}
        >
          {node.children.map((space, i) => {
            const preferredSize = toPercentage(node.sizes?.[i]);
            return (
              <Allotment.Pane key={space.id} preferredSize={preferredSize}>
                <Space node={space} id={id} />
              </Allotment.Pane>
            );
          })}
        </Allotment>
      </SpaceContainer>
    );
  } else if (node.isPanelContainer() && node.hasChildren()) {
    const canSpaceSplit = spaces.canSplitLayout(node);
    const activeChild = node.getActiveChild();

    return (
      <PanelContainer>
        {node.isRoot() && <SavedSpaces />}
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
