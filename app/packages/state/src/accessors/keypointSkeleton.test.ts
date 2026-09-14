// @vitest-environment jsdom

import { renderHook } from "@testing-library/react";
import React from "react";
import { RecoilRoot } from "recoil";
import { describe, expect, it, vi } from "vitest";

import type { KeypointSkeleton } from "@fiftyone/looker/src/state";

/**
 * Skeletons are registered under the dataset's TOP-LEVEL field name, so the
 * accessor has to resolve a frame path (`frames.keypoints`) through its last
 * segment — the same normalization the legacy looker overlay does. The
 * selector family is stubbed to record exactly which key it was asked for;
 * the normalization under test is the real thing.
 */
const stubs = vi.hoisted(() => ({
  requested: [] as string[],
  registry: {} as Record<string, KeypointSkeleton>,
}));

vi.mock("../recoil", async () => {
  const { selectorFamily } = await import("recoil");

  return {
    skeleton: selectorFamily<KeypointSkeleton | null, string>({
      key: "_test/keypointSkeleton/skeleton",
      get: (field) => () => {
        stubs.requested.push(field);
        return stubs.registry[field] ?? null;
      },
    }),
    // the module's other imports are unused by this hook, but the accessor
    // file pulls them all in at import time
    dataset: null,
    datasetId: null,
    datasetName: null,
    fieldSchema: null,
    groupMediaTypes: null,
    isGroup: null,
    selectedMediaField: null,
    State: {},
  };
});

import { useGetKeypointSkeleton } from "./dataset";

const PERSON: KeypointSkeleton = {
  labels: ["head", "neck", "center hip"],
  edges: [[0, 1, 2]],
};

const render = () =>
  renderHook(() => useGetKeypointSkeleton(), {
    wrapper: ({ children }) => React.createElement(RecoilRoot, null, children),
  });

describe("useGetKeypointSkeleton", () => {
  it("resolves a frame path through its last segment", () => {
    stubs.requested = [];
    stubs.registry = { keypoints: PERSON };

    const { result } = render();

    expect(result.current("frames.keypoints")).toEqual(PERSON);
    expect(stubs.requested).toEqual(["keypoints"]);
  });

  // a distinct field per test: the selector family memoizes per key across
  // RecoilRoots, so reusing one would answer from cache and record nothing
  it("resolves a top-level path unchanged", () => {
    stubs.requested = [];
    stubs.registry = { pose: PERSON };

    const { result } = render();

    expect(result.current("pose")).toEqual(PERSON);
    expect(stubs.requested).toEqual(["pose"]);
  });

  it("returns null for a field with no skeleton", () => {
    stubs.requested = [];
    stubs.registry = {};

    const { result } = render();

    expect(result.current("frames.detections")).toBeNull();
  });
});
