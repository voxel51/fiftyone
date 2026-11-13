import { Layout, SpaceNode } from "@fiftyone/spaces";
import SpaceTree from "@fiftyone/spaces/src/SpaceTree";
import { describe, expect, it, vi } from "vitest";
import { OpenPanel } from "./built-in-operators";

function gridWithSamples() {
  const tree = new SpaceTree();
  const samples = new SpaceNode();
  samples.type = "Samples";
  tree.addNodeAfter(tree.root, samples);
  return tree;
}

function open(tree: SpaceTree, name: string) {
  const panels = (node: SpaceNode): SpaceNode[] =>
    node.isPanel() ? [node] : node.children.flatMap(panels);
  return new OpenPanel().execute({
    hooks: {
      availablePanels: [],
      gridSpaces: tree,
      isModalOpen: false,
      modalSpaces: tree,
      openedGridPanels: panels(tree.root),
      openedModalPanels: [],
      initializePanel: vi.fn(),
    },
    params: { name, isActive: true, layout: "horizontal", force: true },
  } as never);
}

const types = (node: SpaceNode) => node.children.map((child) => child.type);

describe("open_panel with a layout", () => {
  it("splits the grid for the first panel", async () => {
    const tree = gridWithSamples();
    await open(tree, "Embeddings");

    expect(tree.root.layout).toBe(Layout.Horizontal);
    expect(tree.root.children.map(types)).toEqual([
      ["Samples"],
      ["Embeddings"],
    ]);
  });

  it("tabs later panels into the existing side pane", async () => {
    const tree = gridWithSamples();
    await open(tree, "Embeddings");
    await open(tree, "Histograms");

    expect(tree.root.children.map(types)).toEqual([
      ["Samples"],
      ["Embeddings", "Histograms"],
    ]);
    const side = tree.root.lastChild();
    expect(side.activeChild).toBe(side.lastChild().id);
  });
});
