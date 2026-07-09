// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { VisualizationRun } from "./protocol";
import RunsList from "./RunsList";

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
  timestamp: null,
  ...extra,
});

// RTL only auto-cleans up with vitest globals enabled; ours are off
afterEach(cleanup);

describe("RunsList", () => {
  // Runs with 3D points are listed and open in the 2D plot; guards
  // against filtering them out of the list
  it("lists 3D runs and opens runs on click", () => {
    const onOpen = vi.fn();
    render(
      <RunsList
        runs={[run("clip_umap"), run("viz3d", { dims: 3 })]}
        error={null}
        onOpen={onOpen}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByText("viz3d")).toBeDefined();

    fireEvent.click(screen.getByText("clip_umap"));
    expect(onOpen).toHaveBeenCalledWith("clip_umap");
  });

  it("shows the upsell until dismissed", () => {
    render(
      <RunsList
        runs={[run("clip_umap")]}
        error={null}
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

  it("deletes only through the armed confirm step", () => {
    const onDelete = vi.fn();
    const onOpen = vi.fn();
    render(
      <RunsList
        runs={[run("clip_umap")]}
        error={null}
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
});
