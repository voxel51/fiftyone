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
  // Product rule (deliberately diverges from the lovable prototype,
  // which filters them): 3D runs stay listed in OSS — users view them
  // in 2D. This is the regression guard for that decision.
  it("lists 3D runs and opens runs on click", () => {
    const onOpen = vi.fn();
    render(
      <RunsList
        runs={[run("clip_umap"), run("viz3d", { dims: 3 })]}
        error={null}
        onOpen={onOpen}
      />,
    );

    expect(screen.getByText("viz3d")).toBeDefined();

    fireEvent.click(screen.getByText("clip_umap"));
    expect(onOpen).toHaveBeenCalledWith("clip_umap");
  });

  it("shows the upsell until dismissed", () => {
    render(
      <RunsList runs={[run("clip_umap")]} error={null} onOpen={vi.fn()} />,
    );

    expect(
      screen.getByText("Explore clusters in three dimensions"),
    ).toBeDefined();

    fireEvent.click(screen.getByText("Dismiss"));
    expect(
      screen.queryByText("Explore clusters in three dimensions"),
    ).toBeNull();
  });
});
