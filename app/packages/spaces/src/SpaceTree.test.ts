import { beforeEach, describe, expect, it, vi } from "vitest";
import SpaceTree from "./SpaceTree";
import SpaceNode from "./SpaceNode";
import { Layout } from "./enums";

describe("SpaceTree", () => {
  let spaceTree: SpaceTree;

  beforeEach(() => {
    spaceTree = new SpaceTree();
  });

  it("creates a new SpaceTree with a root node", () => {
    expect(spaceTree.root).toBeDefined();
    expect(spaceTree.root.children).toEqual([]);
    expect(spaceTree.root.parent).toBe(undefined);
    expect(spaceTree.root.id).toBe("root");
  });

  it("creates a new SpaceTree from a serialized tree", () => {
    const tree = new SpaceTree(samplesAndEmbeddings);
    expect(tree.root).toBeDefined();
    expect(tree.root.children.length).toBe(2);
    expect(tree.root.layout).toBe(Layout.Horizontal);
    expect(tree.root.sizes).toEqual([0.5, 0.5]);
    expect(tree.root.children[0].children[0].isActive()).toBe(true);
    expect(tree.root.children[1].children[0].isActive()).toBe(true);
  });

  it("should add a node to the tree", () => {
    const node = new SpaceNode();
    const rootNode = spaceTree.root;
    spaceTree.addNodeAfter(rootNode, node);
    expect(node).toBeDefined();
    expect(node.parent).toBe(spaceTree.root);
    expect(spaceTree.root.children).toEqual([node]);
  });

  it("should add a panel to the tree without setting it as active", () => {
    const node = new SpaceNode();
    node.type = "my-panel";
    const rootNode = spaceTree.root;
    spaceTree.addNodeAfter(rootNode, node, false);
    expect(spaceTree.root.isPanelContainer()).toBe(true);
    expect(spaceTree.root.isSpaceContainer()).toBe(false);
    expect(spaceTree.root.activeChild).toBe(undefined);
    expect(node.isActive()).toBe(false);
  });

  it("should add a panel to the tree and set it as active", () => {
    const node = new SpaceNode();
    node.type = "my-panel";
    const rootNode = spaceTree.root;
    spaceTree.addNodeAfter(rootNode, node, true);
    expect(spaceTree.root.isPanelContainer()).toBe(true);
    expect(spaceTree.root.isSpaceContainer()).toBe(false);
    expect(spaceTree.root.activeChild).toBe(node.id);
    expect(node.isActive()).toBe(true);
  });

  it("should split a panel container with two panels into space container with two panel container", () => {
    const panelA = new SpaceNode();
    panelA.type = "panel_a";
    const panelB = new SpaceNode();
    panelB.type = "panel_b";
    const rootNode = spaceTree.root;
    spaceTree.addNodeAfter(rootNode, panelA);
    spaceTree.addNodeAfter(rootNode, panelB);
    expect(spaceTree.root.isPanelContainer()).toBe(true);
    expect(spaceTree.root.isSpaceContainer()).toBe(false);
    expect(spaceTree.canSplitLayout(spaceTree.root)).toBe(true);
    spaceTree.splitLayout(spaceTree.root, Layout.Horizontal);
    expect(spaceTree.root.layout).toBe(Layout.Horizontal);
    expect(spaceTree.root.isPanelContainer()).toBe(false);
    expect(spaceTree.root.isSpaceContainer()).toBe(true);
  });

  it("calls onUpdate when tree is updated", () => {
    const onUpdate = vi.fn();
    const tree = new SpaceTree(undefined, onUpdate);
    tree.onUpdate = onUpdate;
    const nodeA = new SpaceNode();
    nodeA.type = "panel_a";
    const nodeB = new SpaceNode();
    nodeB.type = "panel_b";
    tree.addNodeAfter(tree.root, nodeA);
    expect(onUpdate).toBeCalled();
    onUpdate.mockClear();
    tree.addNodeAfter(tree.root, nodeB);
    expect(onUpdate).toBeCalled();
    onUpdate.mockClear();
    tree.splitLayout(tree.root, Layout.Horizontal);
    expect(onUpdate).toBeCalled();
    onUpdate.mockClear();
    tree.setNodeSizes(tree.root, [0.5, 0.5]);
    expect(onUpdate).toBeCalled();
    onUpdate.mockClear();
  });

  it("does not call onUpdate when node sizes set is same as current sizes", () => {
    const onUpdate = vi.fn();
    const tree = new SpaceTree(undefined, onUpdate);
    tree.onUpdate = onUpdate;
    const nodeA = new SpaceNode();
    nodeA.type = "panel_a";
    const nodeB = new SpaceNode();
    nodeB.type = "panel_b";
    tree.addNodeAfter(tree.root, nodeA);
    expect(onUpdate).toBeCalled();
    onUpdate.mockClear();
    tree.addNodeAfter(tree.root, nodeB);
    expect(onUpdate).toBeCalled();
    onUpdate.mockClear();
    tree.setNodeSizes(tree.root, [0.5, 0.5]);
    expect(onUpdate).toBeCalled();
    onUpdate.mockClear();
    tree.setNodeSizes(tree.root, [0.25, 0.75]);
    expect(onUpdate).toBeCalled();
    onUpdate.mockClear();
    tree.setNodeSizes(tree.root, [0.25, 0.75]);
    expect(onUpdate).not.toBeCalled();
  });

  it("joins two space containers into a single space container on remove the only node in a space", () => {
    const tree = new SpaceTree(samplesAndEmbeddings);
    expect(tree.root.isSpaceContainer()).toBe(true);
    tree.removeNode(tree.root.children[0].children[0]);
    expect(tree.root.isSpaceContainer()).toBe(false);
    expect(tree.root.isPanelContainer()).toBe(true);
    console.log(tree.toJSON());
  });

  it("compares two trees for equality", () => {
    const treeA = new SpaceTree(samplesAndEmbeddings);
    const treeB = new SpaceTree(samplesAndEmbeddings);
    expect(treeA.equals(treeB)).toBe(true);
    expect(treeA.equals(samplesAndEmbeddings)).toBe(true);
    treeB.addNodeAfter(treeB.root.children[0], new SpaceNode());
    expect(treeA.equals(treeB)).toBe(false);
  });

  it("sets another node in panel container as active when removing the active node", () => {
    const tree = new SpaceTree();
    const nodeA = new SpaceNode();
    nodeA.type = "panel_a";
    const nodeB = new SpaceNode();
    nodeB.type = "panel_b";
    const nodeC = new SpaceNode();
    nodeC.type = "panel_c";
    tree.addNodeAfter(tree.root, nodeA);
    tree.addNodeAfter(tree.root, nodeB);
    tree.addNodeAfter(tree.root, nodeC);
    expect(nodeC.isActive()).toBe(true);
    tree.removeNode(nodeC);
    expect(nodeB.isActive()).toBe(true);
    expect(tree.root.getActiveChild()).toBe(nodeB);
  });

  it("sets another node in panel container as active when splitting the active node", () => {
    const tree = new SpaceTree();
    const nodeA = new SpaceNode();
    nodeA.type = "panel_a";
    tree.addNodeAfter(tree.root, nodeA);
    const nodeB = new SpaceNode();
    nodeB.type = "panel_b";
    tree.addNodeAfter(tree.root, nodeB);
    const nodeC = new SpaceNode();
    nodeC.type = "panel_c";
    tree.addNodeAfter(tree.root, nodeC);
    tree.setNodeActive(nodeC);
    expect(nodeC.isActive()).toBe(true);
    tree.splitLayout(tree.root, Layout.Horizontal);
    expect(nodeC.isActive()).toBe(true);
  });

  it("splits a provided node in a panel container into separate space", () => {
    const tree = new SpaceTree();
    const nodeA = new SpaceNode();
    nodeA.type = "panel_a";
    tree.addNodeAfter(tree.root, nodeA);
    const nodeB = new SpaceNode();
    nodeB.type = "panel_b";
    tree.addNodeAfter(tree.root, nodeB);
    const nodeC = new SpaceNode();
    nodeC.type = "panel_c";
    tree.addNodeAfter(tree.root, nodeC);
    tree.setNodeActive(nodeC);
    expect(nodeC.isActive()).toBe(true);
    tree.splitLayout(tree.root, Layout.Horizontal, nodeA);
    expect(nodeC.isActive()).toBe(true);
  });
});

const samplesAndEmbeddings = {
  id: "root",
  children: [
    {
      id: "9411f257-83b0-41d4-857b-0221e5bedade",
      children: [
        {
          id: "default-samples-node",
          children: [],
          type: "Samples",
          state: {},
          pinned: true,
        },
      ],
      activeChild: "default-samples-node",
      state: {},
    },
    {
      id: "ac3f9d54-1ff5-470a-9299-2d2c9b520176",
      children: [
        {
          id: "e15e91ee-9d8f-404c-a670-e0fd4c053ad8",
          children: [],
          type: "Embeddings",
          state: {},
        },
      ],
      activeChild: "e15e91ee-9d8f-404c-a670-e0fd4c053ad8",
      state: {},
    },
  ],
  layout: Layout.Horizontal,
  state: {},
  sizes: [0.5, 0.5],
};
