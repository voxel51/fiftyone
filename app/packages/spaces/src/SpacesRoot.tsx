import React from "react";
import * as fop from "@fiftyone/plugins";
import { atom, useRecoilState } from "recoil";

// a type for storing information about a Tab
// a Tab specifies an area of the UI that can be navigated to
// a Tab can either be selected and its panel is shown, or not selected and its panel is hidden
export type Tab = {
  // the label of the tab
  label: string;
  // the icon of the tab
  icon: string;
};

// a type for storing info about a panel
// includes the panels component and the icon to display in the panel's tab
export type Panel = {
  // the name of the panel
  name: string;
  // the component to render for the panel
  component: React.ComponentType;
  // the tab that the panel is associated with
  tab: Tab;
};

// a function that generates a random uuid
function uuid() {
  return Math.random().toString(36).slice(2);
}

// an enum for differnt layouts of a space
export enum Layout {
  Vertical = "vertical",
  Horizontal = "horizontal",
}

function spaceNodeFromJSON(json) {
  const node = new SpaceNode(json.id);
  node.layout = json.layout;
  node.type = json.type;
  node.currentChild = json.currentChild;
  node.children = json.children.map((child) => spaceNodeFromJSON(child));
  return node;
}

export class SpaceNode {
  children: SpaceNode[] = [];
  id: string;
  parent?: SpaceNode;
  type: SPACE_TYPES = SPACE_TYPES.EMPTY;
  activeChild?: string;
  layout: Layout;
  constructor(id?: string) {
    this.id = id || uuid();
  }
  append(node: SpaceNode) {
    this.children.push(node);
    if (node.isPanel()) {
      this.type = SPACE_TYPES.PANEL_CONTAINER;
    }
    node.parent = this;
  }
  hasChildren() {
    return this.children.length > 0;
  }
  hasActiveChild() {
    return !!this.activeChild;
  }
  getActiveChild() {
    return this.children.find((child) => child.id === this.activeChild);
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
  toJSON() {
    return {
      id: this.id,
      children: this.children.map((child) => child.toJSON()),
      type: this.type,
      layout: this.layout,
      currentChild: this.currentChild,
    };
  }
}

class SpaceType {
  constructor(
    public name: string,
    public label: string,
    public icon: string,
    public isSelectable: boolean,
    public componentResolver: () => React.ComponentType
  ) {}
}

// class PluginSpaceType extends SpaceType {
//   constructor(
//     public plugin: string
//   ) {

//     // TODO -
//     // 1. get the plugin's name and icon
//     // 2. get the plugin's component resolver
//     // 3. call super with the plugin's name, icon, and component resolver

//   }
// }

const enum SPACE_TYPES {
  PANEL_CONTAINER = "panel-container",
  FLASHLIGHT = "flashlight",
  EMPTY = "empty",
  GRID = "grid",
  EMBEDDINGS = "embeddings",
  MAP = "map",
}

// TODO - this should be resolved from the plugin registry
const PANELS = {
  empty: new SpaceType("empty", null, false, () => EmptyPanel),
  flashlight: new SpaceType("flashlight", "Grid", "grid-icon"),
  embeddings: new SpaceType("embeddings", "dots-icon"),
  histograms: new SpaceType("embeddings", "dots-icon"),
  map: new SpaceType("map", "map-icon"),
};

// a class for querying and manipulating the space tree
// the space tree has a root node and each node has a list of children
// each node can have a tab associated with it
// the class should be able to re-organize the tree based on the layout
class SpaceTree {
  // the root node of the tree
  root: SpaceNode;

  // the constructor takes the root node, the selected node, and the layout
  constructor(serializedTree?: any) {
    this.root = serializedTree
      ? spaceNodeFromJSON(serializedTree)
      : new SpaceNode("root");
  }

  // a method for adding a new node to the tree
  // the new node is added as a child of the selected node
  // the new node is selected
  addNodeAfter(node: SpaceNode, tab: Tab) {
    // create a new node
    const newNode = new SpaceNode();

    const target = node.parent ? node.parent : node;

    // add the new node to the target node's children
    target.append(newNode);
  }

  // a method for moving a node in the tree
  // the node is moved to the new parent
  // the node is selected
  moveNode(node: SpaceNode, newParent: SpaceNode) {
    // remove the node from its current parent
    node.remove();

    // add the node to the new parent
    newParent.append(node);
  }
  canSplitLayout(node: SpaceNode) {
    // can split a space if it has more than one panel
    return node.getPanels().length > 1;
  }
  splitLayout(node: SpaceNode, layout: Layout) {
    const newNodeA = new SpaceNode();
    const newNodeB = new SpaceNode();
    const lastPanel = node.getLastPanel();

    // move all the current children to the new node
    this.moveNode(lastPanel, newNodeB);
    for (const child of node.children) {
      this.moveNode(child, newNodeA);
    }

    // insert the new nodes into the now empty node
    node.append(newNodeA);
    node.append(newNodeB);
  }
  toJSON() {
    return this.root.toJSON();
  }
}

// a type for storing all the spaces in the app
export type SpacesState = {
  spaces: SpaceTree;
};

function createDefaultSpaces() {
  const spaces = new SpaceTree();
  const defaultGrid = new SpaceNode("default-grid");
  defaultGrid.type = SPACE_TYPES.GRID;
  spaces.root.append(defaultGrid);
  return spaces;
}

// a react hook for managing the state of all spaces in the app
// it should use recoil to persist the tree
const spacesAtom = atom<SpacesState>({
  key: "spaces",
  default: {
    spaces: createDefaultSpaces().toJSON(),
  },
});

export function useSpaces() {
  const [state, setState] = useRecoilState(spacesAtom);
  const spaces = new SpaceTree(state.spaces);
  return {
    spaces,
    updateSpaces: (updater: (spaces: SpaceTree) => void) => {
      setState((latestState) => {
        const spaces = new SpaceTree(latestState.spaces);
        updater(spaces);
        return {
          spaces: spaces.toJSON(),
        };
      });
    },
  };
}

function useActiveSpacePlugins() {
  const ctx = {};
  return [
    ...fop.useActivePlugins(fop.PluginComponentType.SpacePanel, ctx),
    ...fop.useActivePlugins(fop.PluginComponentType.Plot, ctx),
  ];
}

// a react hook for resolving how a spce should be rendered
// it should resolve which component to render based on the space type
// it should resolve the props to pass to the component
export function usePanel(node: SpaceNode) {
  const plugin = activePlugins.find((plugin) => plugin.name === node.type);

  const ContentComponent = plugin?.component;
}

export function SpacesRoot() {
  const { spaces } = useSpaces();
  return <Space node={spaces.root} />;
}

export function Space({ node }) {
  if (node.isPanelContainer() && node.hasChildren()) {
    return (
      <PanelContainer>
        <PanelTabs>
          {node.children.map((child, index) => (
            <PanelTab key={child.id} node={child} />
          ))}
        </PanelTabs>
        {node.hasActiveChild() ? <Panel node={node.getActiveChild()} /> : null}
      </PanelContainer>
    );
  } else if (node.isPanel()) {
    return <Panel node={child} />;
  } else if (node.isEmpty()) {
    return <EmptySpace />;
  }
  return null;
}

export function EmptySpace() {
  return <h1>Empty Space</h1>;
}

export function Panel({ node }) {
  return <h3>{node.label}</h3>;
}

function PanelTab({ node }) {
  return <button>{node.label}</button>;
}
