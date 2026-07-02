/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { describe, expect, it, vi } from "vitest";

// Keep the import light and assert selection logic, not URL formatting or Relay
// wiring. The pure functions only touch `mainSample` (a generated tagged node,
// used elsewhere in the module) and two @fiftyone/state url helpers.
vi.mock("@fiftyone/relay", () => ({ mainSample: {} }));
vi.mock("@fiftyone/state", () => ({
  getNormalizedUrls: (
    urls:
      | readonly { readonly field: string; readonly url: string }[]
      | Record<string, string>
      | null,
  ): Record<string, string> =>
    Array.isArray(urls)
      ? Object.fromEntries(urls.map(({ field, url }) => [field, url]))
      : ((urls ?? {}) as Record<string, string>),
  getSampleSrc: (path: string) => `SRC:${path}`,
}));

import type { mainSampleQuery } from "@fiftyone/relay";
import {
  keyFor,
  reconcileWindow,
  resolveModalMediaSrc,
} from "./useModalPrefetch";

type Response = mainSampleQuery["response"];
// Test fixtures don't construct the full generated union; cast the shape we need.
const response = (sample: unknown): Response =>
  ({ sample }) as unknown as Response;

describe("reconcileWindow", () => {
  const gen = "g";

  it("warms every neighbor on a fresh open, evicts nothing", () => {
    const { toWarm, toEvict } = reconcileWindow({
      currentId: "c",
      generation: gen,
      neighborIds: ["a", "b"],
      existingKeys: [],
    });

    expect(toWarm).toEqual([
      { id: "a", key: keyFor(gen, "a") },
      { id: "b", key: keyFor(gen, "b") },
    ]);
    expect(toEvict).toEqual([]);
  });

  it("never warms the current sample", () => {
    const { toWarm } = reconcileWindow({
      currentId: "c",
      generation: gen,
      neighborIds: ["c", "a"],
      existingKeys: [],
    });
    expect(toWarm).toEqual([{ id: "a", key: keyFor(gen, "a") }]);
  });

  it("skips already-warmed neighbors and dedupes repeated offsets", () => {
    const { toWarm } = reconcileWindow({
      currentId: "c",
      generation: gen,
      neighborIds: ["a", "a", "b"],
      existingKeys: [keyFor(gen, "b")],
    });
    // "a" appears once (dedupe); "b" is skipped (already warmed).
    expect(toWarm).toEqual([{ id: "a", key: keyFor(gen, "a") }]);
  });

  it("keeps current + window and evicts entries that left the window", () => {
    // Moved onto "a" (a former lookahead neighbor); "z" is now out of window.
    const { toWarm, toEvict } = reconcileWindow({
      currentId: "a",
      generation: gen,
      neighborIds: ["b", "x"],
      existingKeys: [keyFor(gen, "a"), keyFor(gen, "b"), keyFor(gen, "z")],
    });
    expect(toWarm).toEqual([{ id: "x", key: keyFor(gen, "x") }]);
    expect(toEvict).toEqual([keyFor(gen, "z")]);
  });

  it("evicts all prior-generation entries when the generation changes", () => {
    const { toWarm, toEvict } = reconcileWindow({
      currentId: "c",
      generation: "g2",
      neighborIds: ["a"],
      existingKeys: [keyFor("g1", "c"), keyFor("g1", "a")],
    });
    expect(toWarm).toEqual([{ id: "a", key: keyFor("g2", "a") }]);
    expect(toEvict).toEqual([keyFor("g1", "c"), keyFor("g1", "a")]);
  });
});

describe("resolveModalMediaSrc", () => {
  const urls = [
    { field: "filepath", url: "/full.jpg" },
    { field: "thumbnail", url: "/thumb.jpg" },
  ];

  it("resolves the requested media field for an image sample", () => {
    expect(
      resolveModalMediaSrc(
        response({ __typename: "ImageSample", urls }),
        "thumbnail",
      ),
    ).toBe("SRC:/thumb.jpg");
  });

  it("falls back to filepath when the media field is absent", () => {
    expect(
      resolveModalMediaSrc(
        response({ __typename: "ImageSample", urls }),
        "missing",
      ),
    ).toBe("SRC:/full.jpg");
  });

  it("returns null when an image sample has no usable url", () => {
    expect(
      resolveModalMediaSrc(
        response({ __typename: "ImageSample", urls: [] }),
        "x",
      ),
    ).toBeNull();
    expect(
      resolveModalMediaSrc(
        response({ __typename: "ImageSample", urls: null }),
        "x",
      ),
    ).toBeNull();
  });

  it("no-ops (returns null) for non-image media — the Phase 1 gate", () => {
    for (const __typename of [
      "VideoSample",
      "ThreeDSample",
      "PointCloudSample",
      "UnknownSample",
      "%other",
    ]) {
      expect(
        resolveModalMediaSrc(response({ __typename, urls }), "thumbnail"),
      ).toBeNull();
    }
  });

  it("returns null for a missing sample", () => {
    expect(resolveModalMediaSrc(response(null), "thumbnail")).toBeNull();
  });
});
