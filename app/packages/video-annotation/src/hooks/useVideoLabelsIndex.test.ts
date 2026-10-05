/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * @vitest-environment jsdom
 */

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VideoFrameLabelsStream } from "../streams/VideoFrameLabelsStream";

const h = vi.hoisted(() => ({
  getVideoLabelsIndex: vi.fn(),
}));

vi.mock("../../../core/src/client/videoLabelsClient", () => ({
  getVideoLabelsIndex: (...args: unknown[]) => h.getVideoLabelsIndex(...args),
}));

import {
  usePublishDynamicGroupMemberIndex,
  usePublishDynamicGroupMemberIndexFailed,
} from "../state/dynamicGroupMemberIndex";
import { useVideoLabelsIndex } from "./useVideoLabelsIndex";

const stream = (sampleId: string, dynamicGroup: string | null = null) =>
  ({
    labelQuery: () => ({
      sampleId,
      dataset: "ds",
      view: [],
      dynamicGroup,
    }),
  }) as unknown as VideoFrameLabelsStream;

const instances = (id: string) => ({ instances: [{ id }] });

/**
 * A deferred index response, so a test can hold the second stream's answer
 * back while it checks what the hook reports in the meantime.
 */
const deferred = () => {
  let resolve: (value: Record<string, unknown>) => void = () => {};
  const promise = new Promise<Record<string, unknown>>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

/**
 * Render the hook and record what EVERY render returned, not just the latest.
 * The stale read this hook guards against happens on the one render between an
 * input change and the effect that resets state for it, which `result.current`
 * alone would never show.
 */
const renderRecording = (initial: {
  stream: VideoFrameLabelsStream | null;
  fields: string[];
}) => {
  const loadedByRender: boolean[] = [];
  const rendered = renderHook(
    (props: { stream: VideoFrameLabelsStream | null; fields: string[] }) => {
      const state = useVideoLabelsIndex(props.stream, props.fields);
      loadedByRender.push(state.loaded);
      return state;
    },
    { initialProps: initial },
  );
  return { ...rendered, loadedByRender };
};

describe("useVideoLabelsIndex", () => {
  beforeEach(() => {
    h.getVideoLabelsIndex.mockReset();
  });

  it("loads the index for the stream and keys it by the sidebar path", async () => {
    h.getVideoLabelsIndex.mockResolvedValue({ detections: instances("a") });

    const { result } = renderRecording({
      stream: stream("s1"),
      fields: ["frames.detections"],
    });
    await act(async () => {});

    expect(h.getVideoLabelsIndex).toHaveBeenCalledWith(
      expect.objectContaining({ sampleId: "s1", fields: ["detections"] }),
    );
    expect(result.current).toEqual({
      loaded: true,
      failed: false,
      indexByPath: { "frames.detections": [{ id: "a" }] },
    });
  });

  it("reads as not loaded for a swapped stream until that stream's index lands", async () => {
    const second = deferred();
    h.getVideoLabelsIndex
      .mockResolvedValueOnce({ detections: instances("a") })
      .mockReturnValueOnce(second.promise);

    const { result, rerender, loadedByRender } = renderRecording({
      stream: stream("s1"),
      fields: ["frames.detections"],
    });
    await act(async () => {});
    expect(result.current.loaded).toBe(true);

    // Swap the stream. Nothing rendered from here on may claim to be loaded:
    // the previous stream's answer is not an answer for this one.
    const swappedAt = loadedByRender.length;
    rerender({ stream: stream("s2"), fields: ["frames.detections"] });
    expect(loadedByRender.slice(swappedAt)).not.toContain(true);
    expect(result.current).toEqual({
      loaded: false,
      failed: false,
      indexByPath: {},
    });

    await act(async () => {
      second.resolve({ detections: instances("b") });
      await second.promise;
    });
    expect(result.current).toEqual({
      loaded: true,
      failed: false,
      indexByPath: { "frames.detections": [{ id: "b" }] },
    });
  });

  it("reads as not loaded once the stream is torn down", async () => {
    h.getVideoLabelsIndex.mockResolvedValue({ detections: instances("a") });

    const { result, rerender, loadedByRender } = renderRecording({
      stream: stream("s1"),
      fields: ["frames.detections"],
    });
    await act(async () => {});
    expect(result.current.loaded).toBe(true);

    const tornDownAt = loadedByRender.length;
    rerender({ stream: null, fields: ["frames.detections"] });
    expect(loadedByRender.slice(tornDownAt)).not.toContain(true);
    expect(result.current).toEqual({
      loaded: false,
      failed: false,
      indexByPath: {},
    });
  });

  it("does not confuse field sets whose names contain the old delimiter", async () => {
    const second = deferred();
    h.getVideoLabelsIndex
      .mockResolvedValueOnce({ a: instances("a"), b: instances("b") })
      .mockReturnValueOnce(second.promise);

    const same = stream("s1");
    const { result, rerender, loadedByRender } = renderRecording({
      stream: same,
      fields: ["frames.a", "frames.b"],
    });
    await act(async () => {});
    expect(result.current.loaded).toBe(true);

    // Same stream, one field whose name joins to the same string as the two
    // above. It is a different request and must be fetched and awaited.
    const changedAt = loadedByRender.length;
    rerender({ stream: same, fields: ["frames.a,frames.b"] });
    expect(loadedByRender.slice(changedAt)).not.toContain(true);
    expect(h.getVideoLabelsIndex).toHaveBeenCalledTimes(2);
    expect(h.getVideoLabelsIndex).toHaveBeenLastCalledWith(
      expect.objectContaining({ fields: ["a,frames.b"] }),
    );
  });

  it("maps a dynamic group's members onto frames once the member order loads", async () => {
    h.getVideoLabelsIndex.mockResolvedValue({
      detections: {
        instances: [
          {
            instanceId: "i1",
            classLabel: "car",
            persistedIndex: null,
            instance: null,
            members: ["m3", "m1", "m2", "gone"],
            keyframeMembers: ["m2"],
          },
        ],
      },
    });

    const groupStream = stream("s1", "video-0");
    const fields = ["frames.detections"];
    const { result } = renderHook(() => ({
      index: useVideoLabelsIndex(groupStream, fields),
      publish: usePublishDynamicGroupMemberIndex(),
    }));
    await act(async () => {});

    // The index landed, but frames come from the member order
    expect(result.current.index).toEqual({
      loaded: false,
      failed: false,
      indexByPath: {},
    });

    act(() => result.current.publish(["m1", "m2", "m3", "m9"]));

    expect(result.current.index).toEqual({
      loaded: true,
      failed: false,
      indexByPath: {
        "frames.detections": [
          {
            instanceId: "i1",
            classLabel: "car",
            persistedIndex: null,
            instance: null,
            segments: [[1, 3]],
            keyframes: [2],
          },
        ],
      },
    });

    act(() => result.current.publish(null));
  });

  it("reports a failed fetch as failed, not as an empty index", async () => {
    h.getVideoLabelsIndex.mockRejectedValue(new Error("boom"));

    const { result } = renderRecording({
      stream: stream("s1"),
      fields: ["frames.detections"],
    });
    await act(async () => {});

    expect(result.current).toEqual({
      loaded: true,
      failed: true,
      indexByPath: {},
    });
  });

  it("reports a dynamic group's failed member order as a failed index", async () => {
    h.getVideoLabelsIndex.mockResolvedValue({ detections: { instances: [] } });

    const groupStream = stream("s1", "video-0");
    const fields = ["frames.detections"];
    const { result } = renderHook(() => ({
      index: useVideoLabelsIndex(groupStream, fields),
      publishFailed: usePublishDynamicGroupMemberIndexFailed(),
    }));
    await act(async () => {});
    expect(result.current.index.loaded).toBe(false);

    act(() => result.current.publishFailed(true));

    expect(result.current.index).toEqual({
      loaded: true,
      failed: true,
      indexByPath: {},
    });

    act(() => result.current.publishFailed(false));
  });
});
