/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * The labels stream must be SUBSCRIBED into the playback engine, not merely
 * registered — only a subscriber makes the engine drive a stream's `prefetch`.
 * Registration without subscription was the regression where labels stopped
 * fetching past the first window.
 */
import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { subscribeStream, unsubscribe } = vi.hoisted(() => {
  const unsubscribe = vi.fn();
  return { subscribeStream: vi.fn(() => unsubscribe), unsubscribe };
});

vi.mock("@fiftyone/playback", () => ({
  usePlayback: () => ({ subscribeStream }),
}));

import { LABELS_STREAM_ID } from "../utils/ids";
import { useDriveLabelsStream } from "./useDriveLabelsStream";

afterEach(() => {
  vi.clearAllMocks();
});

describe("useDriveLabelsStream", () => {
  it("subscribes the labels stream on mount so the engine drives its prefetch", () => {
    renderHook(() => useDriveLabelsStream());

    expect(subscribeStream).toHaveBeenCalledTimes(1);
    expect(subscribeStream).toHaveBeenCalledWith(LABELS_STREAM_ID);
  });

  it("unsubscribes on unmount", () => {
    const { unmount } = renderHook(() => useDriveLabelsStream());

    expect(unsubscribe).not.toHaveBeenCalled();

    unmount();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
