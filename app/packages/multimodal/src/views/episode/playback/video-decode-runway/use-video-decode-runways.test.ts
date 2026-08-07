import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { DecodedFrame, EncodedVideoVisualization } from "../../../../ir";
import type {
  StreamFrameReadRequest,
  StreamFrameReadResult,
} from "../../../../runtime";
import { createTimelineIndex } from "../../../../runtime";
import { markEpisodeLatencyEvent } from "../../../../runtime/latency-observer";
import { useDataStream, type DataStream } from "../data-stream-context";
import {
  createH264DecodeRunwayWindows,
  h264RunwayFromMessages,
  readH264DecodeRunway,
  useVideoDecodeRunway,
  useVideoDecodeRunways,
  VIDEO_DECODE_RUNWAY_POLICY,
} from "./use-video-decode-runways";

vi.mock("../data-stream-context", () => ({ useDataStream: vi.fn() }));
vi.mock("../../../../runtime/latency-observer", async () => {
  const actual = await vi.importActual<
    typeof import("../../../../runtime/latency-observer")
  >("../../../../runtime/latency-observer");
  return { ...actual, markEpisodeLatencyEvent: vi.fn() };
});

const STREAM = "/camera/image";
const OTHER_STREAM = "/camera/rear";
const SECOND = 1_000_000_000n;

afterEach(() => {
  cleanup();
  vi.mocked(useDataStream).mockReturnValue(null);
  vi.mocked(markEpisodeLatencyEvent).mockReset();
  vi.restoreAllMocks();
});

describe("createH264DecodeRunwayWindows", () => {
  it("covers exactly 15/30/60/120 seconds with no overlap or gap", () => {
    const targetTimeNs = 200n * SECOND;
    const windows = createH264DecodeRunwayWindows(0n, targetTimeNs);

    expect(windows).toEqual([
      { startTimeNs: 185n * SECOND, endTimeNs: targetTimeNs - 1n },
      { startTimeNs: 170n * SECOND, endTimeNs: 185n * SECOND - 1n },
      { startTimeNs: 140n * SECOND, endTimeNs: 170n * SECOND - 1n },
      { startTimeNs: 80n * SECOND, endTimeNs: 140n * SECOND - 1n },
    ]);
    for (let index = 1; index < windows.length; index += 1) {
      expect(windows[index].endTimeNs + 1n).toBe(
        windows[index - 1].startTimeNs,
      );
    }
    expect(
      windows.reduce(
        (total, window) => total + window.endTimeNs - window.startTimeNs + 1n,
        0n,
      ),
    ).toBe(VIDEO_DECODE_RUNWAY_POLICY.maxLookbackNs);
  });

  it("clamps the oldest extension to source start", () => {
    const windows = createH264DecodeRunwayWindows(150n * SECOND, 200n * SECOND);

    expect(windows.at(-1)).toEqual({
      startTimeNs: 150n * SECOND,
      endTimeNs: 170n * SECOND - 1n,
    });
  });

  it("returns no window at or before source start", () => {
    expect(createH264DecodeRunwayWindows(10n, 10n)).toEqual([]);
    expect(createH264DecodeRunwayWindows(10n, 9n)).toEqual([]);
  });
});

describe("readH264DecodeRunway", () => {
  it.each([
    ["newest segment", 185n * SECOND, 1],
    ["second segment", 170n * SECOND, 2],
    ["third segment", 140n * SECOND, 3],
    ["oldest segment", 80n * SECOND, 4],
    ["target minus one", 200n * SECOND - 1n, 1],
  ])(
    "finds a keyframe at the %s boundary",
    async (_label, timestampNs, calls) => {
      const keyframe = frame(timestampNs, true);
      const dataStream = dataStreamWithFrames(
        [message(keyframe)],
        80n * SECOND,
      );

      const outcome = await readH264DecodeRunway(
        dataStream,
        STREAM,
        200n * SECOND,
        new AbortController().signal,
      );

      expect(outcome.stopReason).toBe("found");
      expect(outcome.frames).toEqual([keyframe]);
      expect(dataStream.readStreamFrames).toHaveBeenCalledTimes(calls);
    },
  );

  it("finds a keyframe exactly at timeline start", async () => {
    const startTimeNs = 100n * SECOND;
    const keyframe = frame(startTimeNs, true);
    const dataStream = dataStreamWithFrames([message(keyframe)], startTimeNs);

    const outcome = await readH264DecodeRunway(
      dataStream,
      STREAM,
      200n * SECOND,
      new AbortController().signal,
    );

    expect(outcome.stopReason).toBe("found");
    expect(outcome.frames).toEqual([keyframe]);
  });

  it("performs no read when the target is at or before timeline start", async () => {
    const dataStream = dataStreamWithFrames([], 10n);

    const atStart = await readH264DecodeRunway(
      dataStream,
      STREAM,
      10n,
      new AbortController().signal,
    );
    const beforeStart = await readH264DecodeRunway(
      dataStream,
      STREAM,
      9n,
      new AbortController().signal,
    );

    expect(atStart.stopReason).toBe("source-start");
    expect(beforeStart.stopReason).toBe("source-start");
    expect(dataStream.readStreamFrames).not.toHaveBeenCalled();
  });

  it("reconstructs a 2 fps GOP whose keyframe is 90 seconds back", async () => {
    const frames: DecodedFrame[] = [];
    for (
      let timestampNs = 110n * SECOND;
      timestampNs < 200n * SECOND;
      timestampNs += SECOND / 2n
    ) {
      frames.push(message(frame(timestampNs, timestampNs === 110n * SECOND)));
    }
    const dataStream = dataStreamWithFrames(frames, 0n);

    const outcome = await readH264DecodeRunway(
      dataStream,
      STREAM,
      200n * SECOND,
      new AbortController().signal,
    );

    expect(outcome.stopReason).toBe("found");
    expect(outcome.frames).toHaveLength(180);
    expect((outcome.frames[0] as EncodedVideoVisualization).timestampNs).toBe(
      110n * SECOND,
    );
    expect(
      (outcome.frames.at(-1) as EncodedVideoVisualization | undefined)
        ?.timestampNs,
    ).toBe(199_500_000_000n);
  });

  it("returns no partial runway when a cap trips after a keyframe", async () => {
    const keyframe = message(frame(190n * SECOND, true));
    const readStreamFrames = vi.fn(async () =>
      readResult([keyframe], "message-ceiling"),
    );
    const dataStream = createDataStream(readStreamFrames, 0n);

    const outcome = await readH264DecodeRunway(
      dataStream,
      STREAM,
      200n * SECOND,
      new AbortController().signal,
    );

    expect(outcome.stopReason).toBe("message-ceiling");
    expect(outcome.frames).toEqual([]);
  });

  it("returns aborted without reading when the request signal is already aborted", async () => {
    const dataStream = dataStreamWithFrames([], 0n);
    const controller = new AbortController();
    controller.abort();

    const outcome = await readH264DecodeRunway(
      dataStream,
      STREAM,
      20n * SECOND,
      controller.signal,
    );

    expect(outcome.stopReason).toBe("aborted");
    expect(dataStream.readStreamFrames).not.toHaveBeenCalled();
  });

  it("carries the observed-byte allowance cumulatively across windows", async () => {
    const firstWindowBytes = 100;
    const readStreamFrames = vi.fn(async (request: StreamFrameReadRequest) => {
      if (readStreamFrames.mock.calls.length === 1) {
        return {
          ...readResult([messageWithoutVisualization(190n * SECOND)]),
          evidence: {
            ...readResult([]).evidence,
            measurementQuality: "resource-hints" as const,
            observedPayloadBytes: firstWindowBytes,
            scannedMessages: 1,
          },
        };
      }
      expect(request.budget.maxObservedPayloadBytes).toBe(
        VIDEO_DECODE_RUNWAY_POLICY.maxObservedPayloadBytes - firstWindowBytes,
      );
      return {
        ...readResult([], "observed-byte-ceiling"),
        evidence: {
          ...readResult([]).evidence,
          measurementQuality: "resource-hints" as const,
          observedPayloadByteOvershoot: 1,
          observedPayloadBytes:
            VIDEO_DECODE_RUNWAY_POLICY.maxObservedPayloadBytes -
            firstWindowBytes +
            1,
          scannedMessages: 1,
        },
      };
    });
    const dataStream = createDataStream(readStreamFrames, 0n);

    const outcome = await readH264DecodeRunway(
      dataStream,
      STREAM,
      200n * SECOND,
      new AbortController().signal,
    );

    expect(outcome.stopReason).toBe("observed-byte-ceiling");
    expect(outcome.frames).toEqual([]);
    expect(outcome.observedPayloadBytes).toBe(
      VIDEO_DECODE_RUNWAY_POLICY.maxObservedPayloadBytes + 1,
    );
    expect(outcome.observedPayloadByteOvershoot).toBe(1);
  });

  it("accepts a complete chain at the decode ceiling", async () => {
    const frames = dependencyChain(VIDEO_DECODE_RUNWAY_POLICY.maxDecodeFrames);
    const dataStream = dataStreamWithFrames(frames, 0n);

    const outcome = await readH264DecodeRunway(
      dataStream,
      STREAM,
      20n * SECOND,
      new AbortController().signal,
    );

    expect(outcome.stopReason).toBe("found");
    expect(outcome.frames).toHaveLength(
      VIDEO_DECODE_RUNWAY_POLICY.maxDecodeFrames,
    );
  });

  it("rejects a chain one frame past the decode ceiling", async () => {
    const dataStream = dataStreamWithFrames(
      dependencyChain(VIDEO_DECODE_RUNWAY_POLICY.maxDecodeFrames + 1),
      0n,
    );

    const outcome = await readH264DecodeRunway(
      dataStream,
      STREAM,
      20n * SECOND,
      new AbortController().signal,
    );

    expect(outcome.stopReason).toBe("decode-ceiling");
    expect(outcome.frames).toEqual([]);
  });

  it("counts non-H.264 decoded messages without adding them to the runway", async () => {
    const keyframe = frame(19n * SECOND, true);
    const dataStream = dataStreamWithFrames(
      [messageWithoutVisualization(18n * SECOND), message(keyframe)],
      0n,
    );

    const outcome = await readH264DecodeRunway(
      dataStream,
      STREAM,
      20n * SECOND,
      new AbortController().signal,
    );

    expect(outcome.stopReason).toBe("found");
    expect(outcome.scannedMessages).toBe(2);
    expect(outcome.frames).toEqual([keyframe]);
  });
});

describe("h264RunwayFromMessages", () => {
  it("keeps the last keyframe and following deltas", () => {
    const oldKeyframe = frame(1n, true);
    const keyframe = frame(3n, true);
    const delta = frame(4n, false);

    expect(
      h264RunwayFromMessages([
        message(oldKeyframe),
        message(frame(2n, false)),
        message(keyframe),
        message(delta),
      ]),
    ).toEqual([keyframe, delta]);
  });

  it("drops deltas before the first keyframe", () => {
    const keyframe = frame(2n, true);
    expect(
      h264RunwayFromMessages([message(frame(1n, false)), message(keyframe)]),
    ).toEqual([keyframe]);
  });

  it("excludes encoded video with a codec other than H.264", () => {
    const vp9 = {
      ...frame(1n, true),
      codec: "vp9" as const,
    } as unknown as EncodedVideoVisualization;
    expect(h264RunwayFromMessages([message(vp9)])).toEqual([]);
  });
});

describe("useVideoDecodeRunways lifecycle", () => {
  it("keeps an in-flight read across an equivalent-target rerender", async () => {
    const controlled = controlledDataStream();
    vi.mocked(useDataStream).mockReturnValue(controlled.dataStream);
    const target = playbackFrame(6n, false);
    const { result, rerender } = renderHook(
      ({ current }) => useVideoDecodeRunway(STREAM, current),
      { initialProps: { current: target } },
    );
    await waitFor(() => expect(controlled.reads).toHaveLength(1));

    rerender({ current: { ...target } });
    expect(controlled.reads).toHaveLength(1);
    expect(controlled.reads[0].request.signal?.aborted).toBe(false);

    const keyframe = frame(3n, true);
    const delta = frame(5n, false);
    await act(async () => {
      controlled.reads[0].resolve(
        readResult([message(keyframe), message(delta)]),
      );
    });
    await waitFor(() => expect(result.current).toEqual([keyframe, delta]));
  });

  it("aborts an old target and starts the new target immediately", async () => {
    const controlled = controlledDataStream();
    vi.mocked(useDataStream).mockReturnValue(controlled.dataStream);
    const { rerender } = renderHook(
      ({ current }) => useVideoDecodeRunway(STREAM, current),
      { initialProps: { current: playbackFrame(6n, false) } },
    );
    await waitFor(() => expect(controlled.reads).toHaveLength(1));

    rerender({ current: playbackFrame(9n, false) });

    await waitFor(() => expect(controlled.reads).toHaveLength(2));
    expect(controlled.reads[0].request.signal?.aborted).toBe(true);
    expect(controlled.reads[1].request.signal?.aborted).toBe(false);
  });

  it("aborts on stream removal, rejoin, DataStream swap, and unmount", async () => {
    const first = controlledDataStream("first");
    vi.mocked(useDataStream).mockReturnValue(first.dataStream);
    const target = playbackFrame(6n, false);
    const { rerender, unmount } = renderHook(
      ({ stream, current }) => useVideoDecodeRunway(stream, current),
      { initialProps: { stream: STREAM, current: target } },
    );
    await waitFor(() => expect(first.reads).toHaveLength(1));

    rerender({ stream: "", current: target });
    expect(first.reads[0].request.signal?.aborted).toBe(true);
    rerender({ stream: STREAM, current: target });
    await waitFor(() => expect(first.reads).toHaveLength(2));

    const second = controlledDataStream("second");
    vi.mocked(useDataStream).mockReturnValue(second.dataStream);
    rerender({ stream: STREAM, current: target });
    await waitFor(() => expect(second.reads).toHaveLength(1));
    expect(first.reads[1].request.signal?.aborted).toBe(true);

    unmount();
    expect(second.reads[0].request.signal?.aborted).toBe(true);
  });

  it("cancels one stream without disturbing another", async () => {
    const controlled = controlledDataStream();
    vi.mocked(useDataStream).mockReturnValue(controlled.dataStream);
    const { rerender } = renderHook(
      ({ frames }) => useVideoDecodeRunways([STREAM, OTHER_STREAM], frames),
      {
        initialProps: {
          frames: [playbackFrame(6n, false), playbackFrame(6n, false)],
        },
      },
    );
    await waitFor(() => expect(controlled.reads).toHaveLength(2));
    const front = controlled.reads.find(
      (read) => read.request.stream === STREAM,
    );
    const rear = controlled.reads.find(
      (read) => read.request.stream === OTHER_STREAM,
    );

    rerender({
      frames: [playbackFrame(9n, false), playbackFrame(6n, false)],
    });

    await waitFor(() => expect(controlled.reads).toHaveLength(3));
    expect(front?.request.signal?.aborted).toBe(true);
    expect(rear?.request.signal?.aborted).toBe(false);
  });

  it("ignores late resolution after abort without another diagnostic or state change", async () => {
    const controlled = controlledDataStream();
    vi.mocked(useDataStream).mockReturnValue(controlled.dataStream);
    const { result, rerender } = renderHook(
      ({ current }) => useVideoDecodeRunway(STREAM, current),
      { initialProps: { current: playbackFrame(6n, false) } },
    );
    await waitFor(() => expect(controlled.reads).toHaveLength(1));
    rerender({ current: playbackFrame(9n, false) });
    await waitFor(() => expect(controlled.reads).toHaveLength(2));
    const diagnosticCount = vi.mocked(markEpisodeLatencyEvent).mock.calls
      .length;

    await act(async () => {
      controlled.reads[0].resolve(
        readResult([message(frame(3n, true)), message(frame(5n, false))]),
      );
    });

    expect(result.current).toEqual([]);
    expect(markEpisodeLatencyEvent).toHaveBeenCalledTimes(diagnosticCount);
  });

  it("memoizes a source-start keyframe-less interval and recovers outside it", async () => {
    let recoveryFrames: readonly DecodedFrame[] = [];
    const readStreamFrames = vi.fn(async (request: StreamFrameReadRequest) =>
      readResult(
        recoveryFrames.filter(
          (item) =>
            item.timestampNs >= request.startTimeNs &&
            item.timestampNs <= request.endTimeNs,
        ),
      ),
    );
    const dataStream = createDataStream(readStreamFrames, 100n * SECOND);
    vi.mocked(useDataStream).mockReturnValue(dataStream);
    const { result, rerender } = renderHook(
      ({ current }) => useVideoDecodeRunway(STREAM, current),
      { initialProps: { current: playbackFrame(200n * SECOND, false) } },
    );
    await waitFor(() => expect(readStreamFrames).toHaveBeenCalledTimes(4));
    await waitFor(() =>
      expect(markEpisodeLatencyEvent).toHaveBeenCalledWith(
        "episode.video-decode-runway",
        expect.objectContaining({ stopReason: "source-start" }),
      ),
    );

    rerender({ current: playbackFrame(190n * SECOND, false) });
    await waitFor(() =>
      expect(markEpisodeLatencyEvent).toHaveBeenCalledWith(
        "episode.video-decode-runway",
        expect.objectContaining({
          stopReason: "source-start",
          windowsTried: [],
        }),
      ),
    );
    expect(readStreamFrames).toHaveBeenCalledTimes(4);

    const keyframe = frame(205n * SECOND, true);
    const delta = frame(209n * SECOND, false);
    recoveryFrames = [message(keyframe), message(delta)];
    rerender({ current: playbackFrame(210n * SECOND, false) });
    await waitFor(() => expect(readStreamFrames).toHaveBeenCalledTimes(5));
    await waitFor(() => expect(result.current).toEqual([keyframe, delta]));
  });

  it("scans only new backward coverage and stitches after keyframe recovery", async () => {
    let recoveryFrames: readonly DecodedFrame[] = [];
    const requests: StreamFrameReadRequest[] = [];
    const readStreamFrames = vi.fn(async (request: StreamFrameReadRequest) => {
      requests.push(request);
      return readResult(
        recoveryFrames.filter(
          (item) =>
            item.timestampNs >= request.startTimeNs &&
            item.timestampNs <= request.endTimeNs,
        ),
      );
    });
    vi.mocked(useDataStream).mockReturnValue(
      createDataStream(readStreamFrames, 0n),
    );
    const { result, rerender } = renderHook(
      ({ current }) => useVideoDecodeRunway(STREAM, current),
      { initialProps: { current: playbackFrame(200n * SECOND, false) } },
    );
    await waitFor(() => expect(readStreamFrames).toHaveBeenCalledTimes(4));

    rerender({ current: playbackFrame(190n * SECOND, false) });
    await waitFor(() => expect(readStreamFrames).toHaveBeenCalledTimes(5));
    expect(requests[4]).toMatchObject({
      endTimeNs: 80n * SECOND - 1n,
      startTimeNs: 70n * SECOND,
    });

    const keyframe = frame(65n * SECOND, true);
    recoveryFrames = [message(keyframe)];
    rerender({ current: playbackFrame(180n * SECOND, false) });
    await waitFor(() => expect(readStreamFrames).toHaveBeenCalledTimes(7));
    expect(
      requests.slice(5).map(({ endTimeNs, startTimeNs }) => ({
        endTimeNs,
        startTimeNs,
      })),
    ).toEqual([
      { startTimeNs: 60n * SECOND, endTimeNs: 70n * SECOND - 1n },
      { startTimeNs: 70n * SECOND, endTimeNs: 180n * SECOND - 1n },
    ]);
    await waitFor(() => expect(result.current).toEqual([keyframe]));
  });

  it("clears exhausted coverage after a live keyframe", async () => {
    const readStreamFrames = vi.fn(async () => readResult([]));
    const dataStream = createDataStream(readStreamFrames, 100n * SECOND);
    vi.mocked(useDataStream).mockReturnValue(dataStream);
    const { rerender } = renderHook(
      ({ current }) => useVideoDecodeRunway(STREAM, current),
      { initialProps: { current: playbackFrame(200n * SECOND, false) } },
    );
    await waitFor(() => expect(readStreamFrames).toHaveBeenCalledTimes(4));

    rerender({ current: playbackFrame(205n * SECOND, true) });
    rerender({ current: playbackFrame(190n * SECOND, false) });

    await waitFor(() => expect(readStreamFrames).toHaveBeenCalledTimes(8));
  });

  it("reports real faults while keeping expected cancellation quiet", async () => {
    const error = new Error("read exploded");
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const readStreamFrames = vi.fn(async () => {
      throw error;
    });
    vi.mocked(useDataStream).mockReturnValue(
      createDataStream(readStreamFrames, 0n),
    );

    renderHook(({ current }) => useVideoDecodeRunway(STREAM, current), {
      initialProps: { current: playbackFrame(6n, false) },
    });

    await waitFor(() => expect(consoleError).toHaveBeenCalledOnce());
    expect(markEpisodeLatencyEvent).toHaveBeenCalledWith(
      "episode.video-decode-runway",
      expect.objectContaining({ error: "read exploded", stopReason: "failed" }),
    );
    await act(async () => undefined);
    expect(readStreamFrames).toHaveBeenCalledOnce();
    expect(consoleError).toHaveBeenCalledOnce();
  });
});

function dataStreamWithFrames(
  frames: readonly DecodedFrame[],
  startTimeNs: bigint,
): DataStream {
  const readStreamFrames = vi.fn(async (request: StreamFrameReadRequest) => {
    const matching = frames.filter(
      (item) =>
        item.timestampNs >= request.startTimeNs &&
        item.timestampNs <= request.endTimeNs,
    );
    if (matching.length > request.budget.maxMessages) {
      return readResult(
        matching.slice(0, request.budget.maxMessages),
        "message-ceiling",
      );
    }
    return readResult(matching);
  });
  return createDataStream(readStreamFrames, startTimeNs);
}

function createDataStream(
  readStreamFrames: DataStream["readStreamFrames"],
  startTimeNs: bigint,
  sourceKey = "recording",
): DataStream {
  return {
    getStreamCache: () => undefined,
    getTimelineIndex: () =>
      createTimelineIndex({ startNs: startTimeNs, endNs: 1_000n * SECOND }),
    readStreamFrames,
    sourceKey,
    subscribeToStream: () => () => undefined,
  };
}

function controlledDataStream(sourceKey = "recording") {
  const reads: Array<{
    readonly request: StreamFrameReadRequest;
    readonly resolve: (result: StreamFrameReadResult<DecodedFrame>) => void;
    readonly reject: (error: unknown) => void;
  }> = [];
  const readStreamFrames = vi.fn(
    (request: StreamFrameReadRequest) =>
      new Promise<StreamFrameReadResult<DecodedFrame>>((resolve, reject) => {
        reads.push({ reject, request, resolve });
      }),
  );
  return {
    dataStream: createDataStream(readStreamFrames, 0n, sourceKey),
    reads,
  };
}

function readResult(
  frames: readonly DecodedFrame[],
  stopReason: StreamFrameReadResult<DecodedFrame>["stopReason"] = "complete",
): StreamFrameReadResult<DecodedFrame> {
  return {
    evidence: {
      elapsedMs: 1,
      measurementQuality: frames.length > 0 ? "encoded-video-bytes" : "unknown",
      observedPayloadByteOvershoot: 0,
      observedPayloadBytes: frames.reduce(
        (total, item) =>
          total +
          (item.output.visualization?.kind === "encoded-video"
            ? item.output.visualization.bytes.byteLength
            : 0),
        0,
      ),
      scannedMessages: frames.length,
      unknownPayloadMessages: frames.filter(
        (item) => item.output.visualization === undefined,
      ).length,
    },
    frames,
    stopReason,
  };
}

function dependencyChain(length: number): DecodedFrame[] {
  return Array.from({ length }, (_, index) =>
    message(frame(BigInt(index + 1), index === 0)),
  );
}

function playbackFrame(timestampNs: bigint, keyframe: boolean) {
  return { contentTimeNs: timestampNs, frame: frame(timestampNs, keyframe) };
}

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

function message(frameValue: EncodedVideoVisualization): DecodedFrame {
  return {
    output: { visualization: frameValue },
    streamId: STREAM,
    timestampNs: frameValue.timestampNs ?? 0n,
  };
}

function messageWithoutVisualization(timestampNs: bigint): DecodedFrame {
  return { output: {}, streamId: STREAM, timestampNs };
}
