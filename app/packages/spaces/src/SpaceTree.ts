import { Layout } from "./enums";
import SpaceNode from "./SpaceNode";
import { SpaceNodeJSON } from "./types";
import { spaceNodeFromJSON } from "./utils";
import { isEqual } from "lodash";

type SpaceTreeUpdateCallback = (rootNode: SpaceNodeJSON) => void;

// a class for querying and manipulating the space tree
// the space tree has a root node and each node has a list of children
// each node can have a tab associated with it
// the class should be able to re-organize the tree based on the layout
export default class SpaceTree {
  // the root node of the tree
  root: SpaceNode;
  onUpdate: SpaceTreeUpdateCallback = () => {
    // do nothing
  };

  // the constructor takes the root node, the selected node, and the layout
  constructor(
    serializedTree?: SpaceNodeJSON,
    onTreeUpdate?: SpaceTreeUpdateCallback
  ) {
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
  addNodeAfter(node: SpaceNode, newNode: SpaceNode, isActive = true) {
    node.append(newNode);
    if (isActive) node.activeChild = newNode.id;
    this.updateTree(node);
  }

  joinNode(node: SpaceNode) {
    if (node.isSpaceContainer() && node.children.length === 1) {
      for (const child of node.firstChild().children) {
        this.moveNode(child, node);
      }
      node.activeChild = node.firstChild().activeChild;
      node.layout = node.firstChild().layout;
      node.firstChild().remove();
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
      const nextPotentialActiveNode =
        node.getNodeAfter() || node.getNodeBefore();
      node.remove();
      if (node.isActive())
        ancestorNode.activeChild = nextPotentialActiveNode?.id;
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
    return node.getPanels().length > 1;
  }
  splitLayout(node: SpaceNode, layout?: Layout, target?: SpaceNode) {
    const newNodeA = new SpaceNode();
    const newNodeB = new SpaceNode();
    const panelToSplit = target || node.getLastPanel();

    // move all the current children to the new node
    this.moveNode(panelToSplit, newNodeB);
    for (const child of node.children) {
      this.moveNode(child, newNodeA);
    }
    // insert the new nodes into the now empty node
    node.append(newNodeA);
    node.append(newNodeB);
    newNodeA.activeChild =
      node.activeChild === panelToSplit.id
        ? newNodeA.getLastPanel().id
        : node.activeChild;
    newNodeB.activeChild = panelToSplit.id;
    node.layout = layout;
    this.updateTree(node);
  }
  toJSON() {
    return this.root.toJSON();
  }
  equals(treeOrSerializedTree: SpaceTree | SpaceNodeJSON) {
    let compareWithTree: SpaceTree = treeOrSerializedTree as SpaceTree;
    if (!(treeOrSerializedTree instanceof SpaceTree))
      compareWithTree = new SpaceTree(treeOrSerializedTree);
    return isEqual(this.toJSON(), compareWithTree.toJSON());
  }
}
