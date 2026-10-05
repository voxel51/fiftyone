/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { describe, expect, it } from "vitest";
import type { IndexInstance } from "../tracks/frameTracks";
import { FrameCache } from "./frameCache";
import { VideoFrameSource } from "./videoFrameSource";

const PATH = "frames.detections";

const instance: IndexInstance = {
  instanceId: "A",
  classLabel: "cat",
  persistedIndex: null,
  instance: { _cls: "Instance", _id: "A" },
  segments: [[2, 4]],
  keyframes: [2],
};

const loaded = {
  status: "loaded" as const,
  indexByPath: { [PATH]: [instance] },
};

const makeSource = () =>
  new VideoFrameSource(new FrameCache({ frameCount: 10 }));

/** Whether `promise` has settled, and with what, after pending microtasks. */
const peek = async <T>(promise: Promise<T>) => {
  const pending = Symbol("pending");
  return Promise.race([
    promise,
    new Promise<typeof pending>((r) => setTimeout(() => r(pending), 0)),
  ]).then((value) => (value === pending ? "pending" : value));
};

describe("VideoFrameSource track index", () => {
  it("waits while the index loads, then resolves true once it loads", async () => {
    const source = makeSource();
    const ready = source.trackIndexReady();

    expect(await peek(ready)).toBe("pending");
    expect(source.indexedTrack(PATH, "A")).toBeNull();

    source.setIndex(loaded);

    await expect(ready).resolves.toBe(true);
    await expect(source.trackIndexReady()).resolves.toBe(true);
    expect(source.indexedTrack(PATH, "A")).toEqual({
      frames: [2, 3, 4],
      keyframes: [2],
    });
  });

  it("resolves false once the index fails", async () => {
    const source = makeSource();
    const ready = source.trackIndexReady();

    source.setIndex({ status: "failed" });

    await expect(ready).resolves.toBe(false);
    await expect(source.trackIndexReady()).resolves.toBe(false);
    expect(source.indexedTrack(PATH, "A")).toBeNull();
  });

  it("starts a fresh wait when the index reloads", async () => {
    const source = makeSource();
    source.setIndex({ status: "failed" });
    source.setIndex({ status: "loading" });

    const ready = source.trackIndexReady();
    expect(await peek(ready)).toBe("pending");

    source.setIndex(loaded);
    await expect(ready).resolves.toBe(true);

    source.setIndex({ status: "loading" });
    const next = source.trackIndexReady();
    expect(await peek(next)).toBe("pending");

    source.setIndex({ status: "failed" });
    await expect(next).resolves.toBe(false);
  });

  it("keeps answering true when a loaded index is republished", async () => {
    const source = makeSource();
    source.setIndex(loaded);
    source.setIndex({ status: "loaded", indexByPath: { [PATH]: [] } });

    await expect(source.trackIndexReady()).resolves.toBe(true);
    expect(source.indexedTrack(PATH, "A")).toEqual({
      frames: [],
      keyframes: [],
    });
  });
});
