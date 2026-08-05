import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { EncodedVideoVisualization } from "../../../../ir";
import type { DecodedFrame } from "../../../../ir";
import { createTimelineIndex } from "../../../../runtime";
import { useDataStream, type DataStream } from "../data-stream-context";
import {
  h264RunwayFromMessages,
  useVideoDecodeRunway,
} from "./use-video-decode-runways";

vi.mock("../data-stream-context", () => ({ useDataStream: vi.fn() }));

afterEach(() => {
  vi.mocked(useDataStream).mockReturnValue(null);
  cleanup();
});

describe("h264RunwayFromMessages", () => {
  it("keeps the last keyframe and the following delta frames", () => {
    const oldKeyframe = frame(1n, true);
    const oldDelta = frame(2n, false);
    const keyframe = frame(3n, true);
    const deltaA = frame(4n, false);
    const deltaB = frame(5n, false);

    expect(
      h264RunwayFromMessages([
        message(oldKeyframe),
        message(oldDelta),
        message(keyframe),
        message(deltaA),
        message(deltaB),
      ]),
    ).toEqual([keyframe, deltaA, deltaB]);
  });

  it("returns no runway when the range contains only delta frames", () => {
    expect(h264RunwayFromMessages([message(frame(1n, false))])).toEqual([]);
  });

  it("returns an empty runway while a selected stream has no frame", () => {
    const { result } = renderHook(() =>
      useVideoDecodeRunway("/camera/image", null),
    );

    expect(result.current).toEqual([]);
  });

  it("keeps an in-flight runway across rerenders of the same target", async () => {
    let resolveRead!: (messages: readonly DecodedFrame[]) => void;
    const readStreamFrames = vi.fn(
      () =>
        new Promise<readonly DecodedFrame[]>((resolve) => {
          resolveRead = resolve;
        }),
    );
    vi.mocked(useDataStream).mockReturnValue({
      getStreamCache: () => undefined,
      getTimelineIndex: () => createTimelineIndex({ startNs: 0n, endNs: 10n }),
      readStreamFrames,
      sourceKey: "recording",
      subscribeToStream: () => () => undefined,
    } as DataStream);

    const target = { contentTimeNs: 6n, frame: frame(6n, false) };
    const { result, rerender } = renderHook(
      ({ playbackFrame }) =>
        useVideoDecodeRunway("/camera/image", playbackFrame),
      { initialProps: { playbackFrame: target } },
    );
    await waitFor(() => expect(readStreamFrames).toHaveBeenCalledOnce());

    // The playback selector can publish a fresh wrapper while the content
    // target remains unchanged. That rerender must not orphan useful I/O.
    rerender({ playbackFrame: { ...target } });
    const keyframe = frame(3n, true);
    const deltaA = frame(4n, false);
    const deltaB = frame(5n, false);
    await act(async () => {
      resolveRead([message(keyframe), message(deltaA), message(deltaB)]);
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(result.current).toEqual([keyframe, deltaA, deltaB]),
    );
    expect(readStreamFrames).toHaveBeenCalledOnce();
  });

  it("discards a runway when the target genuinely changes", async () => {
    const resolveReads: Array<(messages: readonly DecodedFrame[]) => void> = [];
    const readStreamFrames = vi.fn(
      () =>
        new Promise<readonly DecodedFrame[]>((resolve) => {
          resolveReads.push(resolve);
        }),
    );
    vi.mocked(useDataStream).mockReturnValue({
      getStreamCache: () => undefined,
      getTimelineIndex: () => createTimelineIndex({ startNs: 0n, endNs: 12n }),
      readStreamFrames,
      sourceKey: "recording",
      subscribeToStream: () => () => undefined,
    } as DataStream);

    const { result, rerender } = renderHook(
      ({ playbackFrame }) =>
        useVideoDecodeRunway("/camera/image", playbackFrame),
      {
        initialProps: {
          playbackFrame: { contentTimeNs: 6n, frame: frame(6n, false) },
        },
      },
    );
    await waitFor(() => expect(readStreamFrames).toHaveBeenCalledOnce());
    const nextTarget = { contentTimeNs: 9n, frame: frame(9n, false) };
    rerender({ playbackFrame: nextTarget });
    await act(async () => {
      resolveReads[0]([message(frame(3n, true)), message(frame(5n, false))]);
      await Promise.resolve();
    });
    expect(result.current).toEqual([]);

    // A subsequent playback render can request the live target after the
    // obsolete I/O releases stream ownership.
    rerender({ playbackFrame: { ...nextTarget } });
    await waitFor(() => expect(readStreamFrames).toHaveBeenCalledTimes(2));
    const keyframe = frame(7n, true);
    const delta = frame(8n, false);
    await act(async () => {
      resolveReads[1]([message(keyframe), message(delta)]);
      await Promise.resolve();
    });
    await waitFor(() => expect(result.current).toEqual([keyframe, delta]));
  });
});

function frame(
  timestampNs: bigint,
  keyframe: boolean,
): EncodedVideoVisualization {
  return {
    bytes: Uint8Array.of(0, 0, 0, 1, keyframe ? 0x65 : 0x61),
    codec: "h264",
    format: "h264",
    h264: { hasFrame: true },
    keyframe,
    kind: "encoded-video",
    timestampNs,
  };
}

function message(frame: EncodedVideoVisualization): DecodedFrame {
  return {
    output: { visualization: frame },
  } as DecodedFrame;
}
