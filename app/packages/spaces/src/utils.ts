import SpaceNode from "./SpaceNode";
import { SpaceNodeJSON, SpaceNodeType } from "./types";

export function spaceNodeFromJSON(json: SpaceNodeJSON, parent?: SpaceNode) {
  const node = new SpaceNode(json.id);
  node.layout = json.layout;
  if (json.type) node.type = json.type;
  node.activeChild = json.activeChild;
  node.children = json.children.map((child) => spaceNodeFromJSON(child, node));
  node.parent = parent;
  node.pinned = json.pinned;
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
