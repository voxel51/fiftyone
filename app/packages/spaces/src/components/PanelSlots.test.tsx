import { act, cleanup, render } from "@testing-library/react";
import React, { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SpaceNode from "../SpaceNode";
import SpaceTree from "../SpaceTree";
import { Layout } from "../enums";
import { PanelProps } from "../types";

const lifecycle = vi.hoisted(() => ({
  mounts: [] as string[],
  unmounts: [] as string[],
  tree: undefined as unknown,
}));

vi.mock("./Panel", () => ({
  default: function Panel({ node }: PanelProps) {
    useEffect(() => {
      lifecycle.mounts.push(node.id);
      return () => {
        lifecycle.unmounts.push(node.id);
      };
    }, [node.id]);
    return <div data-panel={node.id} />;
  },
}));
vi.mock("../hooks", () => ({
  usePanelTabAutoPosition: () => () => undefined,
  useSpaces: () => ({ spaces: lifecycle.tree, updateSpaces: () => undefined }),
}));
vi.mock("./Workspaces", () => ({ default: () => null }));
vi.mock("./PanelTab", () => ({ default: () => null }));
vi.mock("./AddPanelButton", () => ({ default: () => null }));
vi.mock("./SplitPanelButton", () => ({ default: () => null }));

import Space from "./Space";
import { displayedPanels } from "./PanelSlots";

const panel = (id: string, type: string) =>
  new SpaceNode(id, [], undefined, type);

describe("Space panel slots", () => {
  let tree: SpaceTree;
  let view: ReturnType<typeof render>;

  // mirrors useSpaces: every update is a fresh tree parsed from JSON
  const commit = (mutate: (tree: SpaceTree) => void) => {
    mutate(tree);
    tree = new SpaceTree(tree.toJSON());
    lifecycle.tree = tree;
    act(() => view.rerender(<Space node={tree.root} id="grid" />));
  };

  const parentOf = (id: string) =>
    view.container.querySelector(`[data-panel="${id}"]`)?.parentElement
      ?.parentElement;

  beforeEach(() => {
    lifecycle.mounts = [];
    lifecycle.unmounts = [];
    tree = new SpaceTree();
    tree.addNodeAfter(tree.root, panel("floodlight", "Floodlight"));
    tree = new SpaceTree(tree.toJSON());
    lifecycle.tree = tree;
    view = render(<Space node={tree.root} id="grid" />);
  });

  afterEach(cleanup);

  it("keeps a panel mounted across split, join and tab moves", () => {
    expect(lifecycle.mounts).toEqual(["floodlight"]);
    const container = parentOf("floodlight");

    commit((t) => {
      t.addNodeAfter(t.root, panel("histograms", "Histograms"));
      t.splitLayout(t.root, Layout.Horizontal);
    });
    expect(tree.root.layout).toBe(Layout.Horizontal);
    expect(lifecycle.mounts).toEqual(["floodlight", "histograms"]);
    expect(lifecycle.unmounts).toEqual([]);
    expect(parentOf("floodlight")).not.toBe(container);

    // move the Floodlight tab into the Histograms container
    commit((t) => {
      const node = t.findNodeById("floodlight") as SpaceNode;
      const target = t.findNodeById("histograms")?.parent as SpaceNode;
      const source = node.parent as SpaceNode;
      t.moveNode(node, target);
      target.activeChild = node.id;
      source.remove();
      t.joinNode(t.root);
    });
    expect(tree.root.layout).toBeUndefined();
    expect(lifecycle.mounts).toEqual(["floodlight", "histograms"]);
    expect(lifecycle.unmounts).toEqual(["histograms"]);

    commit((t) => {
      t.addNodeAfter(t.root, panel("embeddings", "Embeddings"));
      t.splitLayout(t.root, Layout.Vertical);
    });
    commit((t) => t.removeNode(t.findNodeById("embeddings") as SpaceNode));
    expect(tree.root.layout).toBeUndefined();
    expect(lifecycle.mounts).toEqual([
      "floodlight",
      "histograms",
      "embeddings",
    ]);
    expect(lifecycle.unmounts).toEqual(["histograms", "embeddings"]);
    expect(parentOf("floodlight")?.isConnected).toBe(true);
  });

  it("restores scroll offsets lost when the panel's element moves", () => {
    const scroller = view.container.querySelector(
      '[data-panel="floodlight"]',
    ) as HTMLElement;
    scroller.scrollTop = 480;
    const assigned: number[] = [];
    // jsdom keeps offsets across moves; a browser resets them to zero
    const observe = vi
      .spyOn(scroller, "scrollTop", "set")
      .mockImplementation((value: number) => assigned.push(value));

    commit((t) => {
      t.addNodeAfter(t.root, panel("histograms", "Histograms"));
      t.splitLayout(t.root, Layout.Horizontal);
    });
    expect(assigned).toEqual([480]);
    observe.mockRestore();
  });

  it("shows each container's active tab", () => {
    commit((t) => {
      t.addNodeAfter(t.root, panel("histograms", "Histograms"));
      t.addNodeAfter(t.root, panel("embeddings", "Embeddings"), false);
    });
    expect(displayedPanels(tree.root).map(({ id }) => id)).toEqual([
      "histograms",
    ]);
    expect(lifecycle.unmounts).toEqual(["floodlight"]);
  });
});
