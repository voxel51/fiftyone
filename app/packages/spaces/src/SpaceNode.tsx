import { SpaceNodeType, SpaceNodeJSON } from "./types";
import { Layout, SPACE_TYPES } from "./enums";
import { v4 as uuid } from "uuid";

export default class SpaceNode {
  children: SpaceNode[];
  id: string;
  parent?: SpaceNode;
  type: SpaceNodeType;
  activeChild?: string;
  // if layout is set, render as space container instead of panel container
  layout?: Layout;
  pinned?: boolean;
  constructor(
    id?: string,
    children?: SpaceNode[],
    parent?: SpaceNode,
    type?: SpaceNodeType,
    activeChild?: string,
    layout?: Layout
  ) {
    this.id = id || uuid();
    this.children = children || [];
    this.parent = parent;
    this.type = type || SPACE_TYPES.EMPTY;
    this.activeChild = activeChild;
    this.layout = layout;
  }
  append(node: SpaceNode) {
    node.parent = this;
    this.children.push(node);
    if (node.isPanel()) {
      this.type = SPACE_TYPES.PANEL_CONTAINER;
    }
  }
  hasChildren() {
    return this.children.length > 0;
  }
  hasActiveChild() {
    return Boolean(this.activeChild);
  }
  getActiveChild() {
    return this.children.find((child) => child.id === this.activeChild);
  }
  getNodeIndex() {
    return this.parent?.children.findIndex((child) => child.id === this.id);
  }
  getNodeBefore() {
    const nodeIndex = this.getNodeIndex() as number;
    return this.parent?.children[nodeIndex - 1];
  }
  getNodeAfter() {
    const nodeIndex = this.getNodeIndex() as number;
    return this.parent?.children[nodeIndex + 1];
  }
  isActive() {
    return this.parent?.activeChild === this.id;
  }
  isRoot() {
    return !this.parent;
  }
  canRemove() {
    return !this.isRoot();
  }
  remove() {
    if (this.parent) {
      this.parent.children = this.parent.children.filter(
        (child) => child.id !== this.id
      );
    } else {
      throw new Error("Cannot remove root node");
    }
  }
  firstChild() {
    return this.children[0];
  }
  lastChild() {
    return this.children[this.children.length - 1];
  }
  isPanel() {
    return (
      this.type != SPACE_TYPES.EMPTY && this.type != SPACE_TYPES.PANEL_CONTAINER
    );
  }
  isPanelContainer() {
    return this.getPanels().length > 0;
  }
  isSpaceContainer() {
    return Boolean(this.layout);
  }
  isSpace() {
    return !this.isPanel();
  }
  isEmpty() {
    return this.children.length === 0;
  }
  getPanels(): SpaceNode[] {
    return this.children.filter((child) => child.isPanel());
  }
  getLastPanel(): SpaceNode {
    const panels = this.getPanels();
    return panels[panels.length - 1];
  }
  toJSON(): SpaceNodeJSON {
    return {
      id: this.id,
      children: this.children.map((child) => child.toJSON()),
      type: this.type,
      layout: this.layout,
      pinned: this.pinned,
      activeChild: this.activeChild,
    };
  }
}
