/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * @vitest-environment jsdom
 */

import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  isImageDynamicGroupVideo: false,
  /** Paths the engine is asked about, in order — the signature's real input. */
  listLabelsCalls: [] as string[],
}));

vi.mock("@fiftyone/annotation", async (importOriginal) => ({
  // the real predicate is what the hook is being checked against
  isFrameScopedPath: (
    await importOriginal<typeof import("@fiftyone/annotation")>()
  ).isFrameScopedPath,
  useAnnotationEngine: () => ({}),
  // Run the selector for real against a stub `reads`, so the filter under
  // test is the one the hook actually applies.
  useEngineSelector: (_engine: unknown, selector: (reads: unknown) => string) =>
    selector({
      listLabels: ({ path }: { sample: string; path: string }) => {
        h.listLabelsCalls.push(path);
        return [{ _id: "label-1" }];
      },
      getLabelType: () => "Detections",
    }),
}));

vi.mock("@fiftyone/state", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@fiftyone/state")>()),
  useIsImageDynamicGroupVideo: () => h.isImageDynamicGroupVideo,
}));

import { useOnSampleLevelLabelsChange } from "./useOnSampleLevelLabelsChange";

const run = (paths: string[]) => {
  const onChange = vi.fn();
  renderHook(() =>
    useOnSampleLevelLabelsChange("sample-1", new Set(paths), onChange),
  );
  return onChange;
};

describe("useOnSampleLevelLabelsChange", () => {
  beforeEach(() => {
    h.isImageDynamicGroupVideo = false;
    h.listLabelsCalls.length = 0;
  });

  it("video: watches the bare paths and ignores frames.*", () => {
    const onChange = run(["frames.detections", "events"]);

    expect(h.listLabelsCalls).toEqual(["events"]);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("dynamic group video: the bare paths are frame-scoped, so nothing is watched", () => {
    h.isImageDynamicGroupVideo = true;

    const onChange = run(["detections", "events"]);

    expect(h.listLabelsCalls).toEqual([]);
    expect(onChange).not.toHaveBeenCalled();
  });
});
