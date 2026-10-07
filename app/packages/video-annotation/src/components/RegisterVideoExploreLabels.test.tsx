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
 * SCOPE. The store and bridge must be driven by Explore's OWN active fields.
 * The annotation-schema defaults they otherwise fall back on are populated
 * only once the Annotate sidebar has loaded them, so in Explore they are
 * empty and nothing renders. The bridge's scope is deliberately WIDER than
 * the store's registration: it adds the sample-level classifications, whose
 * omission is what kept the top-left bubble off this surface.
 *
 * SAMPLE HYDRATION. The shared `Sample` the composite store's
 * `SampleLabelStore` half reads through is otherwise hydrated only by the
 * Annotate sidebar, and an unhydrated one has an empty schema — so it
 * enumerates no sample-level label at all. Explore has to mount that sync
 * itself.
 */

import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: string[] = [];

const labelTypes = { "frames.detections": "Detections" };
const paths = ["frames.detections", "cls"];
const sampleLevelPaths = ["cls"];

vi.mock("../hooks/useSyncAnnotationFrameClock", () => ({
  useSyncAnnotationFrameClock: () => {
    calls.push("clock");
  },
}));

vi.mock("../hooks/useSyncAnnotationVideoStore", () => ({
  useSyncAnnotationVideoStore: (options: { labelTypes: unknown }) => {
    calls.push(`store:${JSON.stringify(options.labelTypes)}`);
    calls.push(`storeOptions:${JSON.stringify(options)}`);
  },
}));

vi.mock("../hooks/useVideoLighterEngineBridge", () => ({
  useVideoLighterEngineBridge: (arg: unknown) => {
    calls.push(`bridge:${JSON.stringify(arg)}`);
  },
}));

vi.mock("../state/exploreFrameLabelFields", () => ({
  useExploreFrameLabelFields: () => labelTypes,
  useExploreOverlayPaths: () => paths,
  useExploreSampleClassificationPaths: () => sampleLevelPaths,
}));

vi.mock("@fiftyone/annotation", () => ({
  useSyncModalSample: () => {
    calls.push("sample");
  },
}));

import { RegisterVideoExploreLabels } from "./RegisterVideoExploreLabels";

describe("RegisterVideoExploreLabels", () => {
  beforeEach(() => {
    calls.length = 0;
  });

  it("runs clock -> store -> bridge, in that order", () => {
    render(<RegisterVideoExploreLabels />);

    expect(calls.map((c) => c.split(":")[0])).toEqual([
      "sample",
      "clock",
      "store",
      "storeOptions",
      "bridge",
    ]);
  });

  it("scopes the store and the bridge to Explore's own active fields", () => {
    render(<RegisterVideoExploreLabels />);

    // not the annotation-schema defaults, which are empty outside Annotate
    expect(calls).toContain(`store:${JSON.stringify(labelTypes)}`);
    expect(calls).toContain(`bridge:${JSON.stringify(paths)}`);
  });

  it("gives the bridge the sample-level classifications, not just frames.*", () => {
    render(<RegisterVideoExploreLabels />);

    // `bridgeLoop`'s `inScope` tests `paths.has(ref.path)`, so a frames-only
    // scope drops every sample Classification before hydration — which is
    // exactly how the top-left bubble went missing.
    expect(calls).toContain(`bridge:${JSON.stringify(paths)}`);
    expect(paths).toContain("cls");
  });

  it("hands the store the sample-level watch set for the hydration nudge", () => {
    render(<RegisterVideoExploreLabels />);

    // The nudge's own default is `useVisibleLabelSchemas()`, empty in Explore,
    // so without an override `resync` never fires and a sample-level label
    // that resolves its type after mount stays unmounted.
    const store = calls.find((c) => c.startsWith("storeOptions:"));
    expect(store).toBeDefined();
    expect(store).toContain(
      `"sampleLevelPaths":${JSON.stringify(sampleLevelPaths)}`,
    );
  });

  it("hydrates the shared Sample, which only Annotate does otherwise", () => {
    render(<RegisterVideoExploreLabels />);

    // An unhydrated Sample has an empty schema, so `SampleLabelStore` finds no
    // label paths and enumerates nothing sample-level at all.
    expect(calls).toContain("sample");
  });

  it("renders nothing — it is a registrar, not a view", () => {
    const { container } = render(<RegisterVideoExploreLabels />);
    expect(container.firstChild).toBeNull();
  });
});
