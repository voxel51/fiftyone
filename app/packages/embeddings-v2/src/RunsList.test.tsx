// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { GridPatches } from "./gridPatches";
import type { VisualizationRun } from "./protocol";
import RunsList from "./RunsList";

// The real PanelCTA needs the App theme (palette.custom); the stub
// keeps these tests about RunsList's branching, not the shared
// component (same pattern as TabIndicator.test)
vi.mock("@fiftyone/components", () => ({
  PanelCTA: ({ label }: { label: ReactNode }) => <div>{label}</div>,
}));

// The grid's view is App state; these tests set it directly. Null (not a
// patches view) unless a test says otherwise
const grid = vi.hoisted(() => ({ current: null as GridPatches | null }));
vi.mock("./useGridPatches", () => ({ useGridPatches: () => grid.current }));

const run = (
  brainKey: string,
  extra: Partial<VisualizationRun> = {},
): VisualizationRun => ({
  brainKey,
  method: "umap",
  dims: 2,
  patchesField: null,
  pointsField: null,
  model: "clip-vit-base32-torch",
  ready: true,
  error: null,
  timestamp: null,
  ...extra,
});

// RTL only auto-cleans up with vitest globals enabled; ours are off
afterEach(() => {
  cleanup();
  grid.current = null;
});

describe("RunsList", () => {
  // A patches run and a samples run on the same field look identical
  // by title; the card's meta line must say which one it is
  it("labels each card with its embedding granularity", () => {
    render(
      <RunsList
        runs={[run("viz_a"), run("viz_b", { patchesField: "ground_truth" })]}
        onOpen={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByText("samples")).toBeDefined();
    expect(screen.getByText("ground_truth patches")).toBeDefined();
  });

  // The card spec: source segment "model (METHOD)" with a precomputed
  // fallback, and a fixed-format "last updated MM/DD/YYYY"
  it("describes each run's embeddings source and freshness", () => {
    render(
      <RunsList
        runs={[
          run("viz_model", { timestamp: "2026-08-11T18:00:00Z" }),
          run("viz_precomputed", { model: null }),
        ]}
        actionError={null}
        onOpen={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByText("clip-vit-base32-torch (UMAP)")).toBeDefined();
    expect(screen.getByText("pre-computed embeddings (UMAP)")).toBeDefined();
    expect(screen.getByText("last updated 08/11/2026")).toBeDefined();
  });

  // Runs with 3D points are listed and open in the 2D plot; guards
  // against filtering them out of the list
  it("lists 3D runs and opens runs on click", () => {
    const onOpen = vi.fn();
    render(
      <RunsList
        runs={[run("clip_umap"), run("viz3d", { dims: 3 })]}
        onOpen={onOpen}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByText("viz3d")).toBeDefined();

    fireEvent.click(screen.getByText("clip_umap"));
    expect(onOpen).toHaveBeenCalledWith("clip_umap");
  });

  // Clicking a run without results crashed the plot view; pending runs
  // must render inert until the poll flips them ready
  it("marks runs without results Pending and inert", () => {
    const onOpen = vi.fn();
    render(
      <RunsList
        runs={[run("cooking", { ready: false })]}
        onOpen={onOpen}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByText("Pending")).toBeDefined();
    fireEvent.click(screen.getByText("cooking"));
    expect(onOpen).not.toHaveBeenCalled();
  });

  // FOEPD-4437: in a patches view, patches runs on another field cannot
  // link to the grid. They stay listed (hidden, they would read as
  // missing), but disabled, explained, and last
  it("disables patches runs on another field than the grid's patches", () => {
    grid.current = {
      fields: ["ground_truth"],
      label: "ground_truth patches",
    };
    const onOpen = vi.fn();
    render(
      <RunsList
        runs={[
          run("fake_viz", { patchesField: "fake" }),
          run("gt_viz", { patchesField: "ground_truth" }),
          run("img_viz"),
        ]}
        onOpen={onOpen}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByText("Unavailable")).toBeDefined();
    // The reason is a tooltip, so every card keeps the same meta line
    const reason =
      "The grid shows ground_truth patches. This run embeds fake patches.";
    expect(screen.queryByText(reason)).toBeNull();

    const [fake, gt, img] = ["fake_viz", "gt_viz", "img_viz"].map((key) =>
      screen.getByText(key),
    );
    fireEvent.mouseEnter(fake);
    expect(screen.getByText(reason)).toBeDefined();
    // DOM order: the two usable runs first, in dataset order
    expect(
      gt.compareDocumentPosition(img) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      img.compareDocumentPosition(fake) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    fireEvent.click(fake);
    expect(onOpen).not.toHaveBeenCalled();
    fireEvent.click(gt);
    expect(onOpen).toHaveBeenCalledWith("gt_viz");
    // Still deletable from the list
    expect(screen.getAllByLabelText("Run actions")).toHaveLength(3);
  });

  // FOEPD-4369: upselling builds land on the enterprise CTA, not the
  // neutral empty state; hosts that can compute keep the empty state
  it("shows the landing CTA for the upselling no-runs state", () => {
    render(<RunsList runs={[]} onOpen={vi.fn()} onDelete={vi.fn()} />);

    expect(
      screen.getByText(
        "Embeddings help you explore and understand your dataset",
      ),
    ).toBeDefined();
    expect(screen.queryByText("Visualize your embeddings")).toBeNull();
    // The upsell page never offers in-app compute
    expect(screen.queryByText("New visualization")).toBeNull();
    // FOEPD-4401: the 3D banner earns its slot only once a run exists —
    // this state already carries the landing CTA
    expect(
      screen.queryByText("Explore clusters in three dimensions"),
    ).toBeNull();
  });

  it("keeps the neutral empty state when not upselling", () => {
    render(
      <RunsList
        runs={[]}
        showUpsell={false}
        onOpen={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByText("Visualize your embeddings")).toBeDefined();
  });

  it("shows the upsell until dismissed", () => {
    render(
      <RunsList
        runs={[run("clip_umap")]}
        onOpen={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(
      screen.getByText("Explore clusters in three dimensions"),
    ).toBeDefined();

    fireEvent.click(screen.getByText("Dismiss"));
    expect(
      screen.queryByText("Explore clusters in three dimensions"),
    ).toBeNull();
  });

  // The create affordance is capability-gated by the host: no onCreate
  // (builds that can't compute) must mean no button anywhere
  it("renders the create button only when the host provides onCreate", () => {
    const { rerender } = render(
      <RunsList
        runs={[run("clip_umap")]}
        onOpen={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.queryByText("New visualization")).toBeNull();

    const onCreate = vi.fn();
    rerender(
      <RunsList
        runs={[run("clip_umap")]}
        onCreate={onCreate}
        onOpen={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("New visualization"));
    expect(onCreate).toHaveBeenCalled();
  });

  it("deletes only through the armed confirm step", () => {
    const onDelete = vi.fn();
    const onOpen = vi.fn();
    render(
      <RunsList
        runs={[run("clip_umap")]}
        onOpen={onOpen}
        onDelete={onDelete}
      />,
    );

    fireEvent.click(screen.getByLabelText("Run actions"));
    fireEvent.click(screen.getByText("Delete"));
    expect(onDelete).not.toHaveBeenCalled();

    // Cancel disarms
    fireEvent.click(screen.getByText("Cancel"));
    expect(screen.queryByText("Delete run")).toBeNull();

    // Arm again and confirm; the card click must not fire either way
    fireEvent.click(screen.getByLabelText("Run actions"));
    fireEvent.click(screen.getByText("Delete"));
    fireEvent.click(screen.getByText("Delete run"));
    expect(onDelete).toHaveBeenCalledWith("clip_umap");
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("dates a run whose timestamp arrives as epoch milliseconds", () => {
    const epochMs = Date.UTC(2026, 7, 23, 12);
    const expected = new Date(epochMs).toLocaleDateString("en-US", {
      month: "2-digit",
      day: "2-digit",
      year: "numeric",
    });
    render(
      <RunsList
        runs={[run("plain", { timestamp: String(epochMs) })]}
        onOpen={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByText(`last updated ${expected}`)).toBeDefined();
  });

  it("dates a run from its creation timestamp", () => {
    render(
      <RunsList
        runs={[run("plain", { timestamp: "2026-01-02T00:00:00" })]}
        onOpen={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByText("last updated 01/02/2026")).toBeDefined();
  });
});
