/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * @vitest-environment jsdom
 */

import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  labelFields: {} as Record<string, string>,
  index: { indexByPath: {}, loaded: false },
  loaded: [] as number[],
  edited: [] as number[],
  editVersion: 0,
  reads: [] as number[],
  stream: { fps: 30 },
  // stable per field set, as the real accessor is
  visibleFor: new Map<string, Set<string>>(),
  visible(): Set<string> {
    const key = Object.keys(this.labelFields).join("|");
    let set = this.visibleFor.get(key);
    if (!set) {
      set = new Set(Object.keys(this.labelFields));
      this.visibleFor.set(key, set);
    }
    return set;
  },
}));

vi.mock("@fiftyone/annotation", () => ({
  useActiveSampleId: () => "sample-1",
  useAnnotationEngine: () => ENGINE,
  useEngineSelector: (_engine: unknown, selector: () => unknown) => selector(),
}));

vi.mock("../hooks/useVideoLabelsIndex", () => ({
  useVideoLabelsIndex: () => h.index,
}));

vi.mock("../state/accessors", () => ({
  useFrameLabelFields: () => h.labelFields,
  useVisibleLabelSchemas: () => h.visible(),
}));

vi.mock("../streams/frameLabelsStream", () => ({
  useFrameLabelsStream: () => h.stream,
}));

import { useFrameDerivedTracks } from "./useFrameDerivedTracks";

const ENGINE = vi.hoisted(() => ({
  loadedFrames: () => h.loaded,
  editedFrames: () => h.edited,
  editVersion: () => h.editVersion,
  listLabels: ({ frame }: { frame?: number }) => {
    if (frame !== undefined) {
      h.reads.push(frame);
    }
    return [];
  },
}));

const render = () =>
  renderHook(() =>
    useFrameDerivedTracks(
      () => "#fff",
      () => [],
    ),
  ).result.current;

const PATH = "frames.detections";
const INDEXED = {
  indexByPath: {
    [PATH]: [
      {
        instanceId: "a",
        classLabel: "car",
        persistedIndex: null,
        instance: null,
        segments: [[1, 100]] as Array<[number, number]>,
        keyframes: [],
      },
    ],
  },
  loaded: true,
};

describe("useFrameDerivedTracks", () => {
  beforeEach(() => {
    h.labelFields = {};
    h.index = { indexByPath: {}, loaded: false };
    h.loaded = [];
    h.edited = [];
    h.editVersion = 0;
    h.reads = [];
  });

  it("resolves at once when there is no frame field to index", () => {
    // the index fetch never runs for an empty field set, so waiting on it
    // would hold the surface's cover forever
    expect(render().resolved).toBe(true);
  });

  it("waits for the index when there are frame fields", () => {
    h.labelFields = { "frames.detections": "Detections" };

    expect(render().resolved).toBe(false);

    h.index = { indexByPath: { "frames.detections": [] }, loaded: true };
    expect(render().resolved).toBe(true);
  });

  it("an edit to one frame reads only that frame", () => {
    h.labelFields = { [PATH]: "Detections" };
    h.index = INDEXED;
    h.loaded = Array.from({ length: 100 }, (_, i) => i + 1);
    h.edited = [7];
    h.editVersion = 1;

    render();

    expect(h.reads).toEqual([7]);
  });

  it("a chunk landing without edits doesn't rebuild tracks", () => {
    h.labelFields = { [PATH]: "Detections" };
    h.index = INDEXED;
    h.loaded = [1, 2, 3];
    // stable callbacks, as the surface passes them
    const color = () => "#fff";
    const noAttributes = () => [];
    const { result, rerender } = renderHook(() =>
      useFrameDerivedTracks(color, noAttributes),
    );
    const before = result.current.tracks;
    expect(before).toHaveLength(1);

    // a chunk lands: more frames loaded, nothing edited
    h.loaded = [1, 2, 3, 61, 62, 63];
    rerender();

    expect(result.current.tracks).toBe(before);
    expect(h.reads).toEqual([]);
  });
});
