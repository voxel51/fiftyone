/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

/**
 * Explore's label registration, pinned on the two properties its docstring
 * claims and nothing checked.
 *
 * ORDER. The clock installs the `FrameTemporalView`, the store seeds the
 * `FrameStore` from the `/frames` stream, and only then may the bridge
 * reconcile — against a seeded store and the frame view rather than the
 * degenerate pool view. Reordering these is silent at the type level and
 * produces empty overlays at runtime, so assert the sequence directly.
 *
 * SCOPE. The store and bridge must be driven by Explore's OWN active frame
 * fields. The annotation-schema defaults they otherwise fall back on are
 * populated only once the Annotate sidebar has loaded them, so in Explore
 * they are empty and nothing renders.
 */

import { render } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: string[] = [];

const labelTypes = { "frames.detections": "Detections" };
const paths = ["frames.detections"];

vi.mock("../hooks/useSyncAnnotationFrameClock", () => ({
  useSyncAnnotationFrameClock: () => {
    calls.push("clock");
  },
}));

vi.mock("../hooks/useSyncAnnotationVideoStore", () => ({
  useSyncAnnotationVideoStore: (arg: unknown) => {
    calls.push(`store:${JSON.stringify(arg)}`);
  },
}));

vi.mock("../hooks/useVideoLighterEngineBridge", () => ({
  useVideoLighterEngineBridge: (arg: unknown) => {
    calls.push(`bridge:${JSON.stringify(arg)}`);
  },
}));

vi.mock("../state/exploreFrameLabelFields", () => ({
  useExploreFrameLabelFields: () => labelTypes,
  useExploreFrameLabelPaths: () => paths,
}));

import { RegisterVideoExploreLabels } from "./RegisterVideoExploreLabels";

describe("RegisterVideoExploreLabels", () => {
  beforeEach(() => {
    calls.length = 0;
  });

  it("runs clock -> store -> bridge, in that order", () => {
    render(<RegisterVideoExploreLabels />);

    expect(calls.map((c) => c.split(":")[0])).toEqual([
      "clock",
      "store",
      "bridge",
    ]);
  });

  it("scopes the store and the bridge to Explore's own frame fields", () => {
    render(<RegisterVideoExploreLabels />);

    // not the annotation-schema defaults, which are empty outside Annotate
    expect(calls).toContain(`store:${JSON.stringify(labelTypes)}`);
    expect(calls).toContain(`bridge:${JSON.stringify(paths)}`);
  });

  it("renders nothing — it is a registrar, not a view", () => {
    const { container } = render(<RegisterVideoExploreLabels />);
    expect(container.firstChild).toBeNull();
  });
});
