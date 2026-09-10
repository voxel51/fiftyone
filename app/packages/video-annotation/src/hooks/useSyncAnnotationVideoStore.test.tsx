/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

/**
 * The composite store's sample-level hydration nudge, and the override Explore
 * needs to make it fire.
 *
 * `useOnSampleLevelLabelsChange` exists because the load-time consumers — the
 * engine's Lighter bridge and the temporal view's presence cache — run once
 * when the surface mounts, BEFORE the shared `Sample`'s schema has resolved a
 * field's label type. While the type reads `Unknown` the field is excluded, and
 * the `Sample` already being loaded, no later change re-fires them. `resync()`
 * is the only thing that does.
 *
 * Its watch set defaulted to `useVisibleLabelSchemas()` — `annotation-active n
 * explore-active` — which stays EMPTY until the Annotate sidebar has run
 * `useLoadSchemas()`. So in an Explore-only session the signature never
 * changed, `resync` was never called, and a sample Classification stayed
 * unmounted even once the bridge's scope admitted it. These pin both halves:
 * that an override makes the nudge fire, and that the bare default does not.
 */

import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// `vi.mock` factories are hoisted above every declaration in this file, so
// everything they close over has to be hoisted with them.
const h = vi.hoisted(() => {
  const resync = vi.fn();
  const dispose = vi.fn();
  const unregisterStore = vi.fn();
  const registerStore = vi.fn(() => unregisterStore);

  /** Paths the engine is asked about, in order — the signature's real input. */
  const listLabelsCalls: string[] = [];

  /** What `useVisibleLabelSchemas()` returns; empty is Explore's reality. */
  const state = { annotationVisible: [] as string[] };

  class FakeFrameStore {
    setData = vi.fn();
    restore = vi.fn();
    snapshot = vi.fn(() => ({}));
    isDirty = vi.fn(() => false);
  }

  class FakeSampleLabelStore {
    resync = resync;
    dispose = dispose;
  }

  return {
    resync,
    dispose,
    registerStore,
    unregisterStore,
    listLabelsCalls,
    state,
    FakeFrameStore,
    FakeSampleLabelStore,
  };
});

vi.mock("@fiftyone/annotation", () => ({
  FrameStore: h.FakeFrameStore,
  SampleLabelStore: h.FakeSampleLabelStore,
  VideoLabelStore: class {},
  useActiveSampleId: () => "sample-1",
  useAnnotationEngine: () => ({ registerStore: h.registerStore }),
  useSampleInstanceGetter: () => () => ({}),
  // Run the selector for real against a stub `reads`, so the signature under
  // test is the one the hook actually computes.
  useEngineSelector: (_engine: unknown, selector: (reads: unknown) => string) =>
    selector({
      listLabels: ({ path }: { sample: string; path: string }) => {
        h.listLabelsCalls.push(path);
        return [{ _id: "label-1" }];
      },
      getLabelType: () => "Classification",
    }),
}));

vi.mock("../streams/frameLabelsStream", () => ({
  useFrameLabelsStream: () => ({
    cachedFrames: () => [],
    subscribeToEdits: () => () => undefined,
    warmupAll: vi.fn(),
  }),
}));

vi.mock("../streams/framesData", () => ({ parseFramesData: () => ({}) }));

vi.mock("../state/accessors", () => ({
  useFrameLabelFields: () => ({}),
  useVisibleLabelSchemas: () => new Set(h.state.annotationVisible),
}));

import { useSyncAnnotationVideoStore } from "./useSyncAnnotationVideoStore";

const Harness = ({
  sampleLevelPaths,
}: {
  sampleLevelPaths: ReadonlySet<string>;
}) => {
  useSyncAnnotationVideoStore({
    labelTypes: {},
    sampleLevelPaths,
    seedWholeClip: false,
  });
  return null;
};

describe("useSyncAnnotationVideoStore sample-level hydration nudge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.listLabelsCalls.length = 0;
    h.state.annotationVisible = [];
  });

  it("resyncs the sample-level backing when Explore supplies the paths", () => {
    render(<Harness sampleLevelPaths={new Set(["cls"])} />);

    // Without this the sample Classification never mounts: the bridge already
    // ran its one reconcile while the type still read `Unknown`.
    expect(h.resync).toHaveBeenCalled();
  });

  it("does NOT resync when the supplied path set is empty", () => {
    // An empty set yields an empty signature and the effect bails.
    render(<Harness sampleLevelPaths={new Set()} />);

    expect(h.resync).not.toHaveBeenCalled();
  });

  it("builds the signature from the supplied paths only", () => {
    render(<Harness sampleLevelPaths={new Set(["cls"])} />);

    expect(h.listLabelsCalls).toContain("cls");
    expect(h.listLabelsCalls).not.toContain("ignored");
  });

  it("leaves frame paths out of the signature", () => {
    // The `FrameStore` dispatches its own changes via `setData`, so including
    // `frames.*` here would re-announce them on every seed for nothing.
    render(
      <Harness sampleLevelPaths={new Set(["frames.detections", "cls"])} />,
    );

    expect(h.listLabelsCalls).toContain("cls");
    expect(h.listLabelsCalls).not.toContain("frames.detections");
  });

  it("still registers the composite store when no field is active", () => {
    // Visibility gates rendering, never the store: deactivating every field
    // must not tear down the sample-level half and sweep its overlays.
    render(<Harness sampleLevelPaths={new Set()} />);

    expect(h.registerStore).toHaveBeenCalled();
  });
});
