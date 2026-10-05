/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * @vitest-environment jsdom
 */

import { renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  labelFields: {} as Record<string, string>,
  index: { indexByPath: {}, loaded: false, failed: false },
  setToast: vi.fn(),
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
  singletonAddressId: (path: string) => `field:${path}`,
}));

vi.mock("../hooks/useVideoLabelsIndex", () => ({
  useVideoLabelsIndex: () => h.index,
}));

vi.mock("@fiftyone/state", () => ({
  useActivityToast: () => ({ setConfig: h.setToast }),
}));

vi.mock("../state/accessors", () => ({
  useFrameLabelFields: () => h.labelFields,
  useVisibleLabelSchemas: () => h.visible(),
}));

vi.mock("../streams/frameLabelsStream", () => ({
  useFrameLabelsStream: () => h.stream,
}));

import { TRACK_INDEX_FAILED_MESSAGE } from "../hooks/useTrackIndexFailureNotice";
import { FrameCache } from "../streams/frameCache";
import {
  VideoFrameSource,
  VideoFrameSourceProvider,
} from "../streams/videoFrameSource";
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
  failed: false,
};

describe("useFrameDerivedTracks", () => {
  beforeEach(() => {
    h.labelFields = {};
    h.index = { indexByPath: {}, loaded: false, failed: false };
    h.setToast.mockClear();
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

    h.index = {
      indexByPath: { "frames.detections": [] },
      loaded: true,
      failed: false,
    };
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

  describe("track index status", () => {
    const renderWithSource = () => {
      const source = new VideoFrameSource(new FrameCache({ frameCount: 100 }));
      const wrapper = ({ children }: { children: ReactNode }) =>
        createElement(VideoFrameSourceProvider, { value: source }, children);
      const rendered = renderHook(
        () =>
          useFrameDerivedTracks(
            () => "#fff",
            () => [],
          ),
        { wrapper },
      );
      return { source, rerender: rendered.rerender };
    };

    it("publishes the loaded index to the frame source", async () => {
      h.labelFields = { [PATH]: "Detections" };
      const { source, rerender } = renderWithSource();
      const ready = source.trackIndexReady();

      h.index = INDEXED;
      rerender();

      await expect(ready).resolves.toBe(true);
      expect(source.indexedTrack(PATH, "a")?.frames).toHaveLength(100);
    });

    it("publishes a failed index and toasts once for it", async () => {
      h.labelFields = { [PATH]: "Detections" };
      const { source, rerender } = renderWithSource();

      h.index = { indexByPath: {}, loaded: true, failed: true };
      rerender();
      rerender();

      await expect(source.trackIndexReady()).resolves.toBe(false);
      expect(h.setToast).toHaveBeenCalledOnce();
      expect(h.setToast).toHaveBeenCalledWith(
        expect.objectContaining({ message: TRACK_INDEX_FAILED_MESSAGE }),
      );
    });

    it("does not toast without a frame source", () => {
      h.labelFields = { [PATH]: "Detections" };
      h.index = { indexByPath: {}, loaded: true, failed: true };

      render();

      expect(h.setToast).not.toHaveBeenCalled();
    });
  });
});
