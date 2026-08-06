import SpaceNode from "./SpaceNode";
import { panelAreaRenderers } from "./state";
import { SpaceNodeJSON, SpaceNodeType } from "./types";
import { ReactNode } from "react";

export function spaceNodeFromJSON(json: SpaceNodeJSON, parent?: SpaceNode) {
  const node = new SpaceNode(json.id);
  node.layout = json.layout;
  if (json.type) node.type = json.type;
  node.activeChild = json.activeChild;
  node.children = (json.children ?? []).map((child) =>
    spaceNodeFromJSON(child, node),
  );
  node.parent = parent;
  node.pinned = json.pinned;
  node.sizes = json.sizes;
  return node;
}

export function getNodes(node: SpaceNode): SpaceNode[] {
  const nodes = [];
  nodes.push(node);
  if (node.children) {
    for (const child of node.children) {
      nodes.push(...getNodes(child));
    }
  }
  return nodes;
}

export function warnPanelNotFound(name: SpaceNodeType) {
  console.warn(`Panel with name ${name} cannot be found`);
  return null;
}

/**
 * @deprecated Register a panel with `panelOptions.surfaces` instead. This is
 * retained only by the right-sidebar legacy compatibility adapter.
 */
export function registerPanelAreaRenderer(areaId: string, renderer: ReactNode) {
  panelAreaRenderers.set(areaId, renderer);
}

/** @deprecated See `registerPanelAreaRenderer`. */
export function unregisterPanelAreaRenderer(areaId: string) {
  panelAreaRenderers.delete(areaId);
}

/** @deprecated See `registerPanelAreaRenderer`. */
export function getPanelAreaRenderer(areaId: string) {
  return panelAreaRenderers.get(areaId);
}
