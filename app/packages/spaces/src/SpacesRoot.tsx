import React from "react";
import { atom, selectorFamily, useRecoilState, useRecoilValue } from "recoil";
import styled from "styled-components";
import * as fos from "@fiftyone/state";
import { PluginComponentType, useActivePlugins } from "@fiftyone/plugins";
import { Popout } from "@fiftyone/components";
import { v4 as uuid } from "uuid";
import { EnumType } from "typescript";
import ExtensionIcon from "@mui/icons-material/Extension";
import { Resizable } from "re-resizable";

/**
 *
 *  ---------- Enums ----------
 *
 */

// an enum for different layouts of a space
export enum Layout {
  Vertical = "vertical",
  Horizontal = "horizontal",
}

const enum SPACE_TYPES {
  PANEL_CONTAINER = "panel-container",
  EMPTY = "empty",
}

/**
 *
 *  ---------- Core ----------
 *
 */

function spaceNodeFromJSON(json: SpaceNodeJSON, parent?: SpaceNode) {
  const node = new SpaceNode(json.id);
  node.layout = json.layout;
  if (json.type) node.type = json.type;
  node.activeChild = json.activeChild;
  node.children = json.children.map((child) => spaceNodeFromJSON(child, node));
  node.parent = parent;
  node.pinned = json.pinned;
  return node;
}

export class SpaceNode {
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

// a class for querying and manipulating the space tree
// the space tree has a root node and each node has a list of children
// each node can have a tab associated with it
// the class should be able to re-organize the tree based on the layout
class SpaceTree {
  // the root node of the tree
  root: SpaceNode;
  onUpdate: Function = () => {};

  // the constructor takes the root node, the selected node, and the layout
  constructor(serializedTree?: any, onTreeUpdate?: Function) {
    this.root = serializedTree
      ? spaceNodeFromJSON(serializedTree)
      : new SpaceNode("root");
    if (onTreeUpdate) this.onUpdate = onTreeUpdate;
  }

  updateTree(node: SpaceNode) {
    let rootNode = node;
    while (rootNode.parent) {
      rootNode = rootNode.parent;
    }
    this.onUpdate(rootNode.toJSON());
  }

  // a method for adding a new node to the tree
  // the new node is added as a child of the selected node
  // the new node is selected
  addNodeAfter(node: SpaceNode, newNode: SpaceNode) {
    node.append(newNode);
    node.activeChild = newNode.id;
    this.updateTree(node);
  }

  joinNode(node: SpaceNode) {
    if (node.isSpaceContainer() && node.children.length === 1) {
      for (const child of node.firstChild().children) {
        this.moveNode(child, node);
      }
      node.activeChild = node.firstChild().activeChild;
      node.firstChild().remove();
      node.layout = undefined;
      this.updateTree(node);
    }
  }

  removeNode(node: SpaceNode) {
    const parentNode = node.parent;
    let ancestorNode = parentNode;
    if (parentNode?.parent && parentNode?.children.length === 1) {
      ancestorNode = parentNode?.parent;
      parentNode?.remove();
      this.joinNode(ancestorNode);
    } else if (ancestorNode) {
      node.remove();
      ancestorNode.activeChild = ancestorNode?.getLastPanel()?.id;
    }
    if (ancestorNode) this.updateTree(ancestorNode);
  }

  setNodeActive(node: SpaceNode) {
    if (node.parent) {
      node.parent.activeChild = node.id;
      this.updateTree(node);
    }
  }

  // a method for moving a node in the tree
  // the node is moved to the new parent
  // the node is selected
  moveNode(node: SpaceNode, newParent: SpaceNode) {
    // remove the node from its current parent
    node.remove();

    // add the node to the new parent
    newParent.append(node);
    this.updateTree(node);
  }
  canSplitLayout(node: SpaceNode) {
    // can split a space if it has more than one panel
    // and node is root (limit to allow splitting only once)
    return node.getPanels().length > 1 && node.isRoot();
  }
  splitLayout(node: SpaceNode, layout?: Layout) {
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
    newNodeA.activeChild =
      node.activeChild === lastPanel.id
        ? newNodeA.getLastPanel().id
        : node.activeChild;
    newNodeB.activeChild = lastPanel.id;
    node.layout = layout;
    this.updateTree(node);
  }
  toJSON() {
    return this.root.toJSON();
  }
}

// a react hook for managing the state of all spaces in the app
// it should use recoil to persist the tree
const spacesAtom = atom<{ [spaceId: string]: SpaceNodeJSON }>({
  key: "spaces",
  default: {},
});

const spaceSelector = selectorFamily({
  key: "spaceSelector",
  get:
    (spaceId: string) =>
    ({ get }) => {
      return get(spacesAtom)[spaceId];
    },
  set:
    (spaceId: string) =>
    ({ get, set }, spaceState) => {
      const spaces = get(spacesAtom);
      const updateSpaces = { ...spaces };
      updateSpaces[spaceId] = spaceState as SpaceNodeJSON;
      set(spacesAtom, updateSpaces);
    },
});

export function useSpaces(id: string, defaultState?: SpaceNodeJSON) {
  const [state, setState] = useRecoilState(spaceSelector(id));

  if (!state) {
    const baseState = new SpaceNode("root").toJSON();
    setState(defaultState || baseState);
  }

  const spaces = new SpaceTree(state, (spaces: SpaceNodeJSON) => {
    setState(spaces);
  });
  return {
    spaces,
    updateSpaces: (updater: (spaces: SpaceTree) => void) => {
      setState((latestSpaces) => {
        const spaces = new SpaceTree(latestSpaces);
        updater(spaces);
        return {
          spaces: spaces.toJSON(),
        };
      });
    },
  };
}

// Hook to use currently available panels
// todo: add can duplicate logic
function usePanels() {
  const schema = useRecoilValue(
    fos.fieldSchema({ space: fos.State.SPACE.SAMPLE })
  );
  const panels = useActivePlugins(PluginComponentType.Plot, { schema });
  return panels;
}

// Hook to use a panel matching id provided
function usePanel(id: SpaceNodeType) {
  const panels = usePanels();
  return panels.find(({ name }) => name === id);
}

export function SpacesRoot(props: SpacesRootProps) {
  const { id, defaultState } = props;
  const { spaces } = useSpaces(id, defaultState);
  return <Space node={spaces.root} id={id} />;
}

type SpacesRootProps = {
  id: string;
  defaultState?: SpaceNodeJSON;
};

type AddPanelItemProps = {
  node: SpaceNode;
  name: SpaceNodeType;
  label: string;
  Icon?: JSX.Element;
  onClick?: Function;
  spaceId: string;
};

function AddPanelItem({
  node,
  name,
  label,
  onClick,
  spaceId,
}: AddPanelItemProps) {
  const { spaces } = useSpaces(spaceId);
  return (
    <StyledPanelItem
      onClick={() => {
        const newNode = new SpaceNode();
        newNode.type = name;
        spaces.addNodeAfter(node, newNode);
        if (onClick) onClick();
      }}
    >
      <PanelIcon name={name} />
      {label}
    </StyledPanelItem>
  );
}

function AddPanelButton({ node, spaceId }: AddPanelButtonProps) {
  const [open, setOpen] = React.useState(false);
  const panels = usePanels();

  return (
    <AddPanelButtonContainer>
      <GhostButton
        onClick={() => {
          setOpen(!open);
        }}
      >
        +
      </GhostButton>
      {open && (
        <Popout style={{ top: "80%", left: "16%", padding: 0 }}>
          {panels.map((panel) => (
            <AddPanelItem
              spaceId={spaceId}
              {...panel}
              node={node}
              onClick={() => setOpen(!open)}
            />
          ))}
        </Popout>
      )}
    </AddPanelButtonContainer>
  );
}

function SplitPanelButton({ node, layout, spaceId }: SplitPanelButtonProps) {
  const { spaces } = useSpaces(spaceId);

  return (
    <GhostButton
      onClick={() => {
        spaces.splitLayout(node, layout);
      }}
    >
      [ ]
    </GhostButton>
  );
}

export function Space({ node, id }: SpaceProps) {
  const { spaces } = useSpaces(id);

  if (node.layout) {
    return (
      <SpaceContainer data-type="space-container">
        {node.children.map((space) => (
          <Space node={space} id={id} />
        ))}
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

export function EmptySpace() {
  return <h1>Empty Space</h1>;
}

function panelNotFoundError(name: SpaceNodeType) {
  throw new Error(`Panel with name ${name} cannot be found`);
}

export function Panel({ node }: PanelProps) {
  const panelName = node.type;
  const panel = usePanel(panelName);
  if (!panel) panelNotFoundError(panelName);
  const { component: Component } = panel;
  return (
    <StyledPanel id={node.id}>
      <Component panelNode={node} />
    </StyledPanel>
  );
}

type PanelIconProps = {
  name: string;
};

function PanelIcon(props: PanelIconProps) {
  const { name } = props;
  const panel = usePanel(name);
  if (!panel) panelNotFoundError(name);
  const { Icon } = panel;
  const PanelTabIcon = Icon || ExtensionIcon;
  return (
    <PanelTabIcon
      style={{ width: "1rem", height: "1rem", marginRight: "0.5rem" }}
    />
  );
}

function PanelTab({ node, active, spaceId }: PanelTabProps) {
  const { spaces } = useSpaces(spaceId);
  const panelName = node.type;
  const panel = usePanel(panelName);
  if (!panel) panelNotFoundError(panelName);
  return (
    <StyledTab
      onClick={() => {
        if (!active) spaces.setNodeActive(node);
      }}
      active={active}
    >
      <PanelIcon name={panelName as string} />
      {panel.label}
      {!node.pinned && (
        <StyleCloseButton
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            spaces.removeNode(node);
          }}
        >
          x
        </StyleCloseButton>
      )}
    </StyledTab>
  );
}
/**
 *
 *  ---------- Styled Components ----------
 *
 */

const SpaceContainer = styled.div`
  display: flex;
`;
const PanelContainer = styled.div`
  flex: 1;
`;
const PanelTabs = styled.div`
  display: flex;
  background: #252525;
  padding-bottom: 0px;
`;

const StyledPanel = styled.div``;

const GhostButton = styled.button`
  cursor: pointer;
  background: none;
  border: none;
  margin: 4px;
  margin-left: 8px;
  padding: 0px 12px 4px 12px;
  color: #9e9e9e;
  border-radius: 4px;
  color: #fff;
  transition: background ease 0.25s;
  &:hover {
    background: #454545;
  }
`;

const AddPanelButtonContainer = styled.div`
  position: relative;
`;

const StyledPanelItem = styled.div`
  cursor: pointer;
  padding: 4px 8px;
  transition: background ease 0.25s;
  &:hover {
    background: #2b2b2b;
  }
`;

const StyledTab = styled.button<{ active?: boolean }>`
  display: flex;
  align-items: center;
  cursor: ${(props) => (props.active ? "default" : "pointer")};
  background: ${(props) => (props.active ? "#1a1a1a" : "#2c2c2c")};
  border: none;
  color: #fff;
  padding: 0px 12px 4px 12px;
  :hover {
    background: ${(props) => (props.active ? "#1a1a1a" : "hsl(0deg 0% 13%)")};
  }
`;

const StyleCloseButton = styled.button`
  cursor: pointer;
  border: none;
  padding: 2.5px 6px;
  margin-left: 6px;
  background: none;
  color: #fff;
  border-radius: 4px;
  &:hover {
    background: #454545;
  }
`;

/**
 *
 *  ---------- Types ----------
 *
 */

type SpaceNodeType = EnumType | string;

type AddPanelButtonProps = {
  node: SpaceNode;
  spaceId: string;
};

type SplitPanelButtonProps = {
  node: SpaceNode;
  layout: Layout;
  spaceId: string;
};

type SpaceNodeJSON = {
  activeChild: SpaceNode["activeChild"];
  children: Array<SpaceNodeJSON>;
  id: SpaceNode["id"];
  layout: SpaceNode["layout"];
  type?: SpaceNode["type"];
  pinned?: SpaceNode["pinned"];
};

type PanelProps = {
  node: SpaceNode;
};

type PanelTabProps = {
  node: SpaceNode;
  active?: boolean;
  spaceId: string;
};

type SpaceProps = {
  node: SpaceNode;
  id: string;
};
