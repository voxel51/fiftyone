import { afterEach, describe, expect, it, vi } from "vitest";

import type { DecodedFrame } from "../../../ir";
import {
  EpisodeReadCancelledError,
  type EpisodeSession,
  type ReadRequest,
} from "../../../ports";
import { monotonicNowMs } from "../../../utils/monotonic-time";
import { readStreamFramesWithinBudget } from "./use-register-data-stream";

const STREAM = "/camera/h264";
const OBSERVED_BYTE_CEILING = 128 * 1024 * 1024;

afterEach(() => {
  vi.useRealTimers();
});

describe("readStreamFramesWithinBudget", () => {
  it("admits exactly 4,096 messages and aborts before retaining the next", async () => {
    let readSignal: AbortSignal | undefined;
    const frames = Array.from({ length: 4_097 }, (_, index) =>
      decodedFrame(BigInt(index), { resourceHints: { sizeBytes: 1 } }),
    );
    const session = sessionFromRead((request) => {
      readSignal = request.signal;
      return asyncValues([{ frames, stream: STREAM }]);
    });

    const result = await readStreamFramesWithinBudget(
      session,
      request({ maxMessages: 4_096 }),
    );

    expect(result.stopReason).toBe("message-ceiling");
    expect(result.frames).toHaveLength(4_096);
    expect(result.evidence.scannedMessages).toBe(4_096);
    expect(readSignal?.aborted).toBe(true);
  });

  it("completes when the final message lands exactly on the message ceiling", async () => {
    const frames = Array.from({ length: 4_096 }, (_, index) =>
      decodedFrame(BigInt(index), { resourceHints: { sizeBytes: 0 } }),
    );
    const session = sessionFromRead(() =>
      asyncValues([{ frames, stream: STREAM }]),
    );

    const result = await readStreamFramesWithinBudget(
      session,
      request({ maxMessages: 4_096 }),
    );

    expect(result.stopReason).toBe("complete");
    expect(result.frames).toHaveLength(4_096);
    expect(result.evidence.scannedMessages).toBe(4_096);
  });

  it("admits exactly 128 MiB and fails on the first observed byte beyond it", async () => {
    const exact = decodedFrame(1n, {
      resourceHints: { sizeBytes: OBSERVED_BYTE_CEILING },
    });
    const firstByteBeyond = decodedFrame(2n, {
      resourceHints: { sizeBytes: 1 },
    });
    const exactSession = sessionFromRead(() =>
      asyncValues([{ frames: [exact], stream: STREAM }]),
    );
    const overflowSession = sessionFromRead(() =>
      asyncValues([{ frames: [exact, firstByteBeyond], stream: STREAM }]),
    );

    const exactResult = await readStreamFramesWithinBudget(
      exactSession,
      request(),
    );
    const overflowResult = await readStreamFramesWithinBudget(
      overflowSession,
      request(),
    );

    expect(exactResult.stopReason).toBe("complete");
    expect(exactResult.frames).toEqual([exact]);
    expect(overflowResult.stopReason).toBe("observed-byte-ceiling");
    expect(overflowResult.frames).toEqual([exact]);
    expect(overflowResult.evidence).toMatchObject({
      measurementQuality: "resource-hints",
      observedPayloadByteOvershoot: 1,
      observedPayloadBytes: OBSERVED_BYTE_CEILING + 1,
      scannedMessages: 2,
    });
  });

  it("rejects one oversized message without retaining a partial result", async () => {
    const oversized = decodedFrame(1n, {
      resourceHints: { sizeBytes: OBSERVED_BYTE_CEILING + 1 },
    });
    const session = sessionFromRead(() =>
      asyncValues([{ frames: [oversized], stream: STREAM }]),
    );

    const result = await readStreamFramesWithinBudget(session, request());

    expect(result.stopReason).toBe("observed-byte-ceiling");
    expect(result.frames).toEqual([]);
    expect(result.evidence).toMatchObject({
      observedPayloadByteOvershoot: 1,
      scannedMessages: 1,
    });
  });

  it("uses encoded-video bytes as fallback and reports unknown measurements", async () => {
    const encoded = decodedFrame(1n, {
      visualization: {
        bytes: Uint8Array.of(1, 2, 3),
        codec: "h264",
        format: "h264",
        h264: { hasFrame: true },
        keyframe: true,
        kind: "encoded-video",
        timestampNs: 1n,
      },
    });
    const unknown = decodedFrame(2n);
    const session = sessionFromRead(() =>
      asyncValues([{ frames: [encoded, unknown], stream: STREAM }]),
    );

    const result = await readStreamFramesWithinBudget(session, request());

    expect(result.evidence).toMatchObject({
      measurementQuality: "mixed",
      observedPayloadBytes: 3,
      unknownPayloadMessages: 1,
    });
  });

  it("aborts the underlying read when the shared 8-second deadline expires", async () => {
    vi.useFakeTimers();
    let readSignal: AbortSignal | undefined;
    const session = sessionFromRead(async function* (readRequest) {
      readSignal = readRequest.signal;
      await new Promise<never>((_resolve, reject) => {
        readRequest.signal?.addEventListener(
          "abort",
          () => reject(new EpisodeReadCancelledError()),
          { once: true },
        );
      });
      yield { frames: [], stream: STREAM };
    });
    const read = readStreamFramesWithinBudget(session, request());

    await vi.advanceTimersByTimeAsync(8_000);
    const result = await read;

    expect(readSignal?.aborted).toBe(true);
    expect(result.stopReason).toBe("wall-time-ceiling");
    expect(result.frames).toEqual([]);
  });

  it("forwards caller cancellation without turning it into a fault", async () => {
    const controller = new AbortController();
    const session = sessionFromRead(async function* (readRequest) {
      await new Promise<never>((_resolve, reject) => {
        readRequest.signal?.addEventListener(
          "abort",
          () => reject(new EpisodeReadCancelledError()),
          { once: true },
        );
      });
      yield { frames: [], stream: STREAM };
    });
    const read = readStreamFramesWithinBudget(session, {
      ...request(),
      signal: controller.signal,
    });

    controller.abort();

    await expect(read).resolves.toMatchObject({
      frames: [],
      stopReason: "aborted",
    });
  });
});

function request(
  overrides: Partial<{
    maxMessages: number;
    maxObservedPayloadBytes: number;
  }> = {},
) {
  return {
    budget: {
      deadlineMs: monotonicNowMs() + 8_000,
      maxMessages: overrides.maxMessages ?? 4_096,
      maxObservedPayloadBytes:
        overrides.maxObservedPayloadBytes ?? OBSERVED_BYTE_CEILING,
    },
    endTimeNs: 10n,
    startTimeNs: 0n,
    stream: STREAM,
  };
}

function sessionFromRead(
  read: (request: ReadRequest) => AsyncIterable<{
    readonly frames: readonly DecodedFrame[];
    readonly stream: string;
  }>,
): Pick<EpisodeSession, "read"> {
  return { read };
}

async function* asyncValues<Value>(values: Iterable<Value>) {
  for await (const value of values) yield value;
}

function decodedFrame(
  timestampNs: bigint,
  output: DecodedFrame["output"] = {},
): DecodedFrame {
  return { output, streamId: STREAM, timestampNs };
}
