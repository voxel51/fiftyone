import { describe, expect, it, vi } from "vitest";

import type { EncodedH264VideoVisualization } from "../ir";
import { VISUALIZATION_KIND } from "../ir";
import { VideoPlaybackManager } from "./playback-manager";
import { SharedVideoPresentation } from "./presentation";
import { MAX_H264_GOP_ACCESS_UNITS } from "./stream-engine";
import type {
  H264AccessUnit,
  VideoAccessUnitReader,
  VideoDecoderActor,
  VideoEngineDependencies,
} from "./types";
import { VideoIntentCancelledError } from "./types";

describe("VideoPlaybackManager and VideoStreamEngine", () => {
  it("shares one authoritative decoder across duplicate 2D/3D consumers", async () => {
    const harness = createHarness();
    const manager = new VideoPlaybackManager("source", harness.dependencies);
    const panel = manager.acquire("/camera");
    const frustum = manager.acquire("/camera");
    const keyframe = accessUnit(0, true);

    panel.request({ ...keyframe, priority: "playing" });
    frustum.request({ ...keyframe, priority: "visible" });
    await presented(panel, 0n);

    expect(harness.decoders).toHaveLength(1);
    expect(harness.decoders[0].decodeCalls).toHaveLength(1);
    expect(manager.stats()).toMatchObject({ engineCount: 1, ownerCount: 2 });

    panel.release();
    expect(harness.decoders[0].closeCount).toBe(0);
    frustum.release();
    expect(harness.decoders[0].closeCount).toBe(1);
  });

  it("reports deterministic manager closure to guarded and direct consumers", () => {
    const harness = createHarness();
    const manager = new VideoPlaybackManager("source", harness.dependencies);
    expect(manager.isClosed).toBe(false);
    manager.close();
    expect(manager.isClosed).toBe(true);
    expect(() => manager.acquire("/camera")).toThrow(
      "Video playback manager closed",
    );
  });

  it("keeps keyframe-to-delta forward progress on one decoder", async () => {
    const harness = createHarness();
    const manager = new VideoPlaybackManager("source", harness.dependencies);
    const lease = manager.acquire("/camera");

    lease.request({ ...accessUnit(1, true), priority: "playing" });
    await presented(lease, 1n);
    lease.request({ ...accessUnit(2), priority: "playing" });
    await presented(lease, 2n);

    expect(harness.decoders).toHaveLength(1);
    expect(harness.decoders[0].resetCount).toBe(0);
    expect(
      harness.decoders[0].decodeCalls.map((call) => call.units.length),
    ).toEqual([1, 1]);
    lease.release();
  });

  it("fills a skipped forward access unit instead of decoding a broken delta chain", async () => {
    const harness = createHarness();
    const units = [
      accessUnit(0, true),
      accessUnit(100),
      accessUnit(200),
      accessUnit(300),
    ];
    const manager = new VideoPlaybackManager("source", harness.dependencies);
    manager.setReader(rangeReader(units));
    const lease = manager.acquire("/camera");
    lease.request({ ...units[0], priority: "playing" });
    await presented(lease, 0n);
    lease.request({ ...units[1], priority: "playing" });
    await presented(lease, 100n);

    lease.request({ ...units[3], priority: "playing" });
    await presented(lease, 300n);
    expect(
      harness.decoders[0].decodeCalls.at(-1)?.units.map((unit) => unit.timeNs),
    ).toEqual([200n, 300n]);
    expect(harness.decoders[0].resetCount).toBe(0);
    lease.release();
  });

  it("waits instead of decoding a reader-less delta across a cursor gap", async () => {
    const harness = createHarness();
    const manager = new VideoPlaybackManager("source", harness.dependencies);
    const lease = manager.acquire("/camera");
    lease.request({ ...accessUnit(0, true), priority: "playing" });
    await presented(lease, 0n);

    lease.request({ ...accessUnit(1_000_000_000), priority: "visible" });
    await vi.waitFor(() =>
      expect(lease.getSnapshot()).toMatchObject({
        diagnostic: { message: "Waiting for an H.264 access unit reader" },
        phase: "waiting-for-keyframe",
      }),
    );
    expect(harness.decoders[0].decodeCalls).toHaveLength(1);
    lease.release();
  });

  it("resets for a backward keyframe but not a same-GOP forward seek", async () => {
    const harness = createHarness();
    const units = [
      accessUnit(0, true),
      ...Array.from({ length: 101 }, (_, index) => accessUnit(index + 1)),
    ];
    const manager = new VideoPlaybackManager("source", harness.dependencies);
    manager.setReader(rangeReader(units));
    const lease = manager.acquire("/camera");
    lease.request({ ...units[0], priority: "playing" });
    await presented(lease, 0n);
    lease.request({ ...units[100], priority: "visible" });
    await presented(lease, 100n);
    expect(harness.decoders[0].resetCount).toBe(0);

    lease.request({ ...units[0], priority: "visible" });
    await presented(lease, 0n);
    expect(harness.decoders[0].resetCount).toBe(1);
    lease.release();
  });

  it("resets and starts at the new keyframe on a configuration epoch seek", async () => {
    const harness = createHarness();
    const firstKeyframe = accessUnit(0, true);
    const secondKeyframe = accessUnit(500_000_000, true, "avc1.640028");
    const target = accessUnit(1_000_000_000);
    const manager = new VideoPlaybackManager("source", harness.dependencies);
    manager.setReader(rangeReader([firstKeyframe, secondKeyframe, target]));
    const lease = manager.acquire("/camera");
    lease.request({ ...firstKeyframe, priority: "playing" });
    await presented(lease, 0n);
    lease.request({ ...target, priority: "visible" });
    await presented(lease, 1_000_000_000n);

    expect(harness.decoders[0].resetCount).toBe(1);
    expect(harness.decoders[0].decodeCalls[1].units[0]).toMatchObject({
      timeNs: 500_000_000n,
    });
    lease.release();
  });

  it("admits more than six live streams fairly without evicting any", async () => {
    const decodeGate = deferred<void>();
    const harness = createHarness({ decodeGate: decodeGate.promise });
    const manager = new VideoPlaybackManager("source", harness.dependencies, 2);
    manager.setReader(readerForStreams());
    const leases = Array.from({ length: 8 }, (_, index) => {
      const lease = manager.acquire(`/camera/${index}`);
      lease.request({ ...accessUnit(10), priority: "visible" });
      return lease;
    });

    await vi.waitFor(() => {
      expect(manager.stats()).toMatchObject({
        engineCount: 8,
        historicalSeekCount: 2,
        ownerCount: 8,
        waitingSeekCount: 6,
      });
    });
    expect(harness.decoders.every((decoder) => decoder.closeCount === 0)).toBe(
      true,
    );

    decodeGate.resolve();
    await Promise.all(leases.map((lease) => presented(lease, 10n)));
    expect(harness.decodeOrder).toEqual(
      Array.from({ length: 8 }, (_, index) => `/camera/${index}`),
    );
    expect(harness.decoders.every((decoder) => decoder.closeCount === 0)).toBe(
      true,
    );
    manager.close();
    expect(harness.decoders.every((decoder) => decoder.closeCount === 1)).toBe(
      true,
    );
  });

  it("promotes a duplicate queued target without restarting its generation", async () => {
    const holderGate = deferred<void>();
    const harness = createHarness({
      beforeDecode: (id) =>
        id === "decoder-0" ? holderGate.promise : Promise.resolve(),
    });
    const manager = new VideoPlaybackManager("source", harness.dependencies, 1);
    manager.setReader(readerForStreams());
    const holder = manager.acquire("/camera/0");
    const promoted = manager.acquire("/camera/1");
    const visible = manager.acquire("/camera/2");
    holder.request({ ...accessUnit(10), priority: "visible" });
    await vi.waitFor(() => expect(manager.stats().historicalSeekCount).toBe(1));
    promoted.request({ ...accessUnit(20), priority: "background" });
    visible.request({ ...accessUnit(20), priority: "visible" });
    await vi.waitFor(() => expect(manager.stats().waitingSeekCount).toBe(2));
    const generation = promoted.getSnapshot().generation;

    promoted.request({ ...accessUnit(20), priority: "playing" });
    expect(promoted.getSnapshot().generation).toBe(generation);
    holderGate.resolve();
    await presented(promoted, 20n);
    expect(harness.decodeOrder.slice(0, 2)).toEqual(["/camera/0", "/camera/1"]);
    await presented(visible, 20n);
    manager.close();
  });

  it("decodes a backward keyframe without waiting for historical capacity", async () => {
    const holderGate = deferred<void>();
    const harness = createHarness({
      beforeDecode: (id, targetTimeNs) =>
        id === "decoder-0" && targetTimeNs === 10n
          ? holderGate.promise
          : Promise.resolve(),
    });
    const manager = new VideoPlaybackManager("source", harness.dependencies, 1);
    manager.setReader(readerForStreams());
    const holder = manager.acquire("/camera/0");
    const keyframes = manager.acquire("/camera/1");
    keyframes.request({ ...accessUnit(100, true), priority: "playing" });
    await presented(keyframes, 100n);
    holder.request({ ...accessUnit(10), priority: "visible" });
    await vi.waitFor(() => expect(manager.stats().historicalSeekCount).toBe(1));

    keyframes.request({ ...accessUnit(50, true), priority: "visible" });
    await presented(keyframes, 50n);
    expect(manager.stats().waitingSeekCount).toBe(0);
    holderGate.resolve();
    manager.close();
  });

  it("cancels obsolete reads and conflates pending targets to the latest", async () => {
    const harness = createHarness();
    const abortedTargets: bigint[] = [];
    const reader: VideoAccessUnitReader = {
      timelineStartTimeNs: 0n,
      read: ({ endTimeNs, signal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener(
            "abort",
            () => {
              abortedTargets.push(endTimeNs + 1n);
              reject(new Error("read aborted"));
            },
            { once: true },
          );
        }),
    };
    const manager = new VideoPlaybackManager("source", harness.dependencies);
    manager.setReader(reader);
    const lease = manager.acquire("/camera");
    lease.request({ ...accessUnit(100), priority: "visible" });
    await vi.waitFor(() =>
      expect(lease.getSnapshot().phase).toBe("seeking.reading"),
    );

    lease.request({ ...accessUnit(200, true), priority: "playing" });
    lease.request({ ...accessUnit(300, true), priority: "playing" });
    await presented(lease, 300n);

    expect(abortedTargets).toEqual([100n]);
    expect(harness.decoders[0].decodeCalls.map((call) => call.target)).toEqual([
      300n,
    ]);
    lease.release();
  });

  it("closes stale submitted output for a discontinuous seek", async () => {
    const firstDecode = deferred<VideoFrame>();
    const harness = createHarness({ firstDecode });
    const manager = new VideoPlaybackManager("source", harness.dependencies);
    const lease = manager.acquire("/camera");
    lease.request({ ...accessUnit(1, true), priority: "playing" });
    await vi.waitFor(() =>
      expect(harness.decoders[0].decodeCalls).toHaveLength(1),
    );
    lease.request({
      ...accessUnit(1_000_000_000, true),
      priority: "playing",
    });
    lease.request({
      ...accessUnit(2_000_000_000, true),
      priority: "playing",
    });

    const stale = fakeVideoFrame();
    firstDecode.resolve(stale.frame);
    await presented(lease, 2_000_000_000n);

    expect(stale.close).toHaveBeenCalledOnce();
    expect(harness.decoders[0].decodeCalls.map((call) => call.target)).toEqual([
      1n,
      2_000_000_000n,
    ]);
    lease.release();
  });

  it("keeps publishing while H.264 copies lag continuous forward input", async () => {
    const copyGates = new Map<bigint, ReturnType<typeof deferred<void>>>();
    const harness = createHarness({
      beforeCopy: async (timeNs) => {
        const gate = deferred<void>();
        copyGates.set(timeNs, gate);
        await gate.promise;
      },
    });
    const frameIntervalNs = 70_422_535;
    const units = Array.from({ length: 10 }, (_, index) =>
      accessUnit(index * frameIntervalNs, index % 5 === 0),
    );
    const manager = new VideoPlaybackManager("source", harness.dependencies);
    manager.setReader(rangeReader(units));
    const lease = manager.acquire("/camera");
    const published: bigint[] = [];
    let lastPresentedTimeNs: bigint | null = null;
    const unsubscribe = lease.subscribe(() => {
      const presentedTimeNs = lease.getSnapshot().presentedTimeNs;
      if (presentedTimeNs !== null && presentedTimeNs !== lastPresentedTimeNs) {
        lastPresentedTimeNs = presentedTimeNs;
        published.push(presentedTimeNs);
      }
    });

    lease.request({ ...units[0], priority: "playing" });
    for (let index = 1; index < units.length; index += 1) {
      const previousTimeNs = units[index - 1].timeNs;
      await vi.waitFor(() => expect(copyGates.has(previousTimeNs)).toBe(true));
      // Models an 83ms grid request arriving before a >83ms bitmap copy. The
      // producer never pauses, so a burst-only latest-wins test cannot pass it.
      lease.request({ ...units[index], priority: "playing" });
      copyGates.get(previousTimeNs)?.resolve();
    }
    const lastUnit = units.at(-1);
    const penultimateUnit = units.at(-2);
    if (!lastUnit || !penultimateUnit) throw new Error("expected churn units");
    await vi.waitFor(() => expect(copyGates.has(lastUnit.timeNs)).toBe(true));

    expect(published.length).toBeGreaterThanOrEqual(units.length - 1);
    expect(published.at(-1)).toBe(penultimateUnit.timeNs);

    copyGates.get(lastUnit.timeNs)?.resolve();
    unsubscribe();
    lease.release();
  });

  it("lets useful playing work finish while conflating rapid forward intents", async () => {
    const gate = deferred<void>();
    const harness = createHarness({
      decodeGate: gate.promise,
      honorAbort: true,
    });
    const manager = new VideoPlaybackManager("source", harness.dependencies);
    const lease = manager.acquire("/camera");
    lease.request({ ...accessUnit(0, true), priority: "playing" });
    await vi.waitFor(() =>
      expect(harness.decoders[0].decodeCalls).toHaveLength(1),
    );

    lease.request({ ...accessUnit(1), priority: "playing" });
    lease.request({ ...accessUnit(2), priority: "playing" });
    lease.request({ ...accessUnit(3), priority: "playing" });
    gate.resolve();
    await presented(lease, 3n);

    expect(harness.decoders[0].decodeCalls.map((call) => call.target)).toEqual([
      0n,
      3n,
    ]);
    expect(harness.decoders[0].resetCount).toBe(0);
    lease.release();
  });

  it("uses decode-order dependencies that present after a B-frame target", async () => {
    const harness = createHarness();
    const keyframe = accessUnit(0, true, "avc1.4D001F", 0);
    const futurePresentation = accessUnit(2, false, "avc1.4D001F", 1);
    const target = accessUnit(1, false, "avc1.4D001F", 2);
    const read = vi.fn(async () => ({
      complete: true,
      units: [keyframe, futurePresentation, target],
    }));
    const manager = new VideoPlaybackManager("source", harness.dependencies);
    manager.setReader({ timelineStartTimeNs: 0n, read });
    const lease = manager.acquire("/camera");
    lease.request({ ...keyframe, priority: "playing" });
    await presented(lease, 0n);
    expect(
      harness.decoders[0].decodeCalls.at(-1)?.units.map((unit) => unit.timeNs),
    ).toEqual([0n, 2n, 1n]);

    lease.request({ ...target, priority: "playing" });
    await presented(lease, 1n);
    expect(
      harness.decoders[0].decodeCalls.at(-1)?.units.map((unit) => unit.timeNs),
    ).toEqual([1n]);

    lease.request({ ...futurePresentation, priority: "playing" });
    await presented(lease, 2n);
    expect(
      harness.decoders[0].decodeCalls.at(-1)?.units.map((unit) => unit.timeNs),
    ).toEqual([2n]);
    expect(harness.decoders[0].resetCount).toBe(0);
    lease.release();
  });

  it.each([601, 1_024])(
    "consumes a complete %i-frame long GOP with its keyframe and target",
    async (target) => {
      const harness = createHarness();
      const units = Array.from({ length: target }, (_, index) =>
        accessUnit(index, index === 0),
      );
      const manager = new VideoPlaybackManager("source", harness.dependencies);
      manager.setReader(rangeReader(units));
      const lease = manager.acquire("/camera");
      lease.request({ ...accessUnit(target), priority: "visible" });

      await presented(lease, BigInt(target));
      const consumed = harness.decoders[0].decodeCalls[0].units;
      expect(consumed).toHaveLength(target + 1);
      expect(consumed[0]).toMatchObject({ timeNs: 0n });
      expect(consumed[0].frame.keyframe).toBe(true);
      expect(consumed.at(-1)?.timeNs).toBe(BigInt(target));
      lease.release();
    },
  );

  it("rejects a dependency chain beyond the bounded decode budget", async () => {
    const harness = createHarness();
    const target = MAX_H264_GOP_ACCESS_UNITS;
    const units = Array.from({ length: target + 1 }, (_, index) =>
      accessUnit(index, index === 0),
    );
    const manager = new VideoPlaybackManager("source", harness.dependencies);
    manager.setReader(rangeReader(units));
    const lease = manager.acquire("/camera");
    lease.request({ ...units[target], priority: "visible" });

    await vi.waitFor(() =>
      expect(lease.getSnapshot()).toMatchObject({
        diagnostic: {
          message: "H.264 dependency chain exceeds the bounded decode budget",
        },
        phase: "waiting-for-keyframe",
      }),
    );
    expect(harness.decoders[0].decodeCalls).toHaveLength(0);
    lease.release();
  });

  it("restores direct-forward continuity after cancellation reaches a keyframe", async () => {
    const gate = deferred<void>();
    const harness = createHarness({
      decodeGate: gate.promise,
      honorAbort: true,
    });
    const read = vi.fn(async () => ({ complete: true, units: [] }));
    const manager = new VideoPlaybackManager("source", harness.dependencies);
    manager.setReader({ timelineStartTimeNs: 0n, read });
    const lease = manager.acquire("/camera");
    lease.request({ ...accessUnit(0, true), priority: "playing" });
    await vi.waitFor(() =>
      expect(harness.decoders[0].decodeCalls).toHaveLength(1),
    );

    lease.request({
      ...accessUnit(1_000_000_000, true),
      priority: "playing",
    });
    await vi.waitFor(() =>
      expect(harness.decoders[0].decodeCalls).toHaveLength(2),
    );
    gate.resolve();
    await presented(lease, 1_000_000_000n);
    lease.request({ ...accessUnit(1_000_000_001), priority: "playing" });
    await presented(lease, 1_000_000_001n);
    lease.request({ ...accessUnit(1_000_000_002), priority: "playing" });
    await presented(lease, 1_000_000_002n);

    expect(read).toHaveBeenCalledOnce();
    expect(read).toHaveBeenCalledWith(
      expect.objectContaining({
        endTimeNs: 1_000_000_001n,
        startTimeNs: 1_000_000_001n,
      }),
    );
    lease.release();
  });

  it("retains partial keyframe progress without claiming read coverage", async () => {
    const harness = createHarness();
    const keyframe = accessUnit(0, true);
    const target = accessUnit(2);
    const read = vi
      .fn<VideoAccessUnitReader["read"]>()
      .mockResolvedValueOnce({
        complete: false,
        stopReason: "message-ceiling",
        units: [keyframe],
      })
      .mockResolvedValueOnce({
        complete: true,
        units: [keyframe, accessUnit(1), target],
      });
    const manager = new VideoPlaybackManager("source", harness.dependencies);
    manager.setReader({ timelineStartTimeNs: 0n, read });
    const lease = manager.acquire("/camera");
    lease.request({ ...target, priority: "visible" });
    await vi.waitFor(() =>
      expect(lease.getSnapshot().phase).toBe("waiting-for-keyframe"),
    );

    lease.request({ ...target, priority: "playing" });
    await presented(lease, 2n);
    expect(read).toHaveBeenCalledTimes(2);
    expect(read.mock.calls[1][0]).toMatchObject({
      endTimeNs: 2n,
      startTimeNs: 0n,
    });
    lease.release();
  });

  it("keeps the last honest presentation while a backward seek waits", async () => {
    const harness = createHarness();
    const readGate = deferred<void>();
    const units = [accessUnit(0, true), accessUnit(1), accessUnit(2)];
    const reader = rangeReader(units, readGate.promise);
    const manager = new VideoPlaybackManager("source", harness.dependencies);
    manager.setReader(reader);
    const lease = manager.acquire("/camera");
    lease.request({ ...accessUnit(10, true), priority: "playing" });
    await presented(lease, 10n);
    const honest = lease.getSnapshot().presentation;

    lease.request({ ...accessUnit(2), priority: "visible" });
    await vi.waitFor(() =>
      expect(lease.getSnapshot().phase).toBe("seeking.reading"),
    );
    expect(lease.getSnapshot().presentation).toBe(honest);
    expect(lease.getSnapshot().presentedTimeNs).toBe(10n);

    readGate.resolve();
    await presented(lease, 2n);
    lease.release();
  });

  it("retries a same-target dependency request after stronger runway data arrives", async () => {
    const harness = createHarness();
    const manager = new VideoPlaybackManager("source", harness.dependencies);
    const weakReader: VideoAccessUnitReader = {
      timelineStartTimeNs: 0n,
      read: async () => ({
        complete: false,
        stopReason: "message-ceiling",
        units: [],
      }),
    };
    manager.setReader(weakReader);
    const lease = manager.acquire("/camera");
    const target = accessUnit(2);
    lease.request({ ...target, priority: "visible" });
    await vi.waitFor(() =>
      expect(lease.getSnapshot().phase).toBe("waiting-for-keyframe"),
    );

    manager.setReader(
      rangeReader([accessUnit(0, true), accessUnit(1), target]),
    );
    lease.request({ ...target, priority: "playing" });
    await presented(lease, 2n);
    expect(harness.decoders[0].decodeCalls[0].units[0].frame.keyframe).toBe(
      true,
    );
    lease.release();
  });

  it("defensively closes decoder output when presentation copy rejects", async () => {
    const harness = createHarness();
    const manager = new VideoPlaybackManager("source", {
      ...harness.dependencies,
      copyPresentation: async () => {
        throw new Error("copy failed without taking ownership");
      },
    });
    const lease = manager.acquire("/camera");
    lease.request({ ...accessUnit(1, true), priority: "visible" });

    await vi.waitFor(() =>
      expect(lease.getSnapshot()).toMatchObject({
        diagnostic: { message: "copy failed without taking ownership" },
        phase: "faulted",
      }),
    );
    expect(harness.decoders[0].outputs).toHaveLength(1);
    expect(harness.decoders[0].outputs[0].close).toHaveBeenCalledOnce();
    lease.release();
  });

  it("closes every decoder and presentation exactly once on source close", async () => {
    const harness = createHarness();
    const manager = new VideoPlaybackManager("source", harness.dependencies);
    const leases = [manager.acquire("a"), manager.acquire("b")];
    leases[0].request({ ...accessUnit(1, true), priority: "playing" });
    leases[1].request({ ...accessUnit(1, true), priority: "playing" });
    await Promise.all(leases.map((lease) => presented(lease, 1n)));

    manager.close();
    manager.close();
    expect(harness.decoders.map((decoder) => decoder.closeCount)).toEqual([
      1, 1,
    ]);
    expect(harness.presentationSources).toHaveLength(2);
    expect(
      harness.presentationSources.every(
        (source) => vi.mocked(source.close).mock.calls.length === 1,
      ),
    ).toBe(true);
  });
});

function createHarness(
  options: {
    readonly beforeDecode?: (id: string, targetTimeNs: bigint) => Promise<void>;
    readonly beforeCopy?: (timeNs: bigint) => Promise<void>;
    readonly decodeGate?: Promise<void>;
    readonly firstDecode?: ReturnType<typeof deferred<VideoFrame>>;
    readonly honorAbort?: boolean;
  } = {},
) {
  const decoders: FakeDecoderActor[] = [];
  const decodeOrder: string[] = [];
  const presentationSources: Array<{ close: ReturnType<typeof vi.fn> }> = [];
  const dependencies: VideoEngineDependencies = {
    copyPresentation: async (frame, timeNs) => {
      await options.beforeCopy?.(timeNs);
      frame.close();
      const source = { close: vi.fn(), height: 480, width: 640 };
      presentationSources.push(source);
      return new SharedVideoPresentation(
        source as unknown as ImageBitmap,
        timeNs,
        640,
        480,
      );
    },
    createDecoder: () => {
      const decoder = new FakeDecoderActor(
        `decoder-${decoders.length}`,
        decodeOrder,
        options,
      );
      decoders.push(decoder);
      return decoder;
    },
    nowMs: () => performance.now(),
  };
  return { decodeOrder, decoders, dependencies, presentationSources };
}

class FakeDecoderActor implements VideoDecoderActor {
  closeCount = 0;
  configuredCodec: string | null = null;
  cursorDecodeTimeNs: bigint | null = null;
  cursorTimeNs: bigint | null = null;
  readonly decodeCalls: Array<{
    readonly target: bigint;
    readonly units: readonly H264AccessUnit[];
  }> = [];
  readonly outputs: ReturnType<typeof fakeVideoFrame>[] = [];
  resetCount = 0;

  constructor(
    private readonly id: string,
    private readonly decodeOrder: string[],
    private readonly options: {
      readonly beforeDecode?: (
        id: string,
        targetTimeNs: bigint,
      ) => Promise<void>;
      readonly beforeCopy?: (timeNs: bigint) => Promise<void>;
      readonly decodeGate?: Promise<void>;
      readonly firstDecode?: ReturnType<typeof deferred<VideoFrame>>;
      readonly honorAbort?: boolean;
    },
  ) {}

  async decode(
    units: readonly H264AccessUnit[],
    {
      signal,
      targetTimeNs,
    }: {
      readonly signal: AbortSignal;
      readonly targetTimeNs: bigint;
    },
  ): Promise<VideoFrame> {
    if (this.active) throw new Error("Concurrent video decoder transaction");
    this.active = true;
    try {
      this.decodeCalls.push({ target: targetTimeNs, units });
      this.decodeOrder.push(this.id.replace("decoder-", "/camera/"));
      await this.options.beforeDecode?.(this.id, targetTimeNs);
      if (this.options.firstDecode && this.decodeCalls.length === 1) {
        const frame = await abortable(
          this.options.firstDecode.promise,
          signal,
          this.options.honorAbort === true,
        );
        this.cursorTimeNs = targetTimeNs;
        return frame;
      }
      await abortable(
        this.options.decodeGate ?? Promise.resolve(),
        signal,
        this.options.honorAbort === true,
      );
      this.cursorTimeNs = targetTimeNs;
      this.cursorDecodeTimeNs =
        units.at(-1)?.frame.decodeTimestampNs ?? targetTimeNs;
      this.configuredCodec = units[0]?.frame.h264.codecString ?? "avc1.4D001F";
      const output = fakeVideoFrame();
      this.outputs.push(output);
      return output.frame;
    } finally {
      this.active = false;
    }
  }

  private active = false;

  resetForDiscontinuity(): void {
    this.resetCount += 1;
    this.cursorTimeNs = null;
    this.cursorDecodeTimeNs = null;
    this.configuredCodec = null;
  }

  close(): void {
    this.closeCount += 1;
  }
}

function accessUnit(
  time: number,
  keyframe = false,
  codecString = "avc1.4D001F",
  decodeTime?: number,
): H264AccessUnit {
  const timeNs = BigInt(time);
  return {
    frame: {
      bytes: Uint8Array.of(0, 0, 1, keyframe ? 0x65 : 0x41, time & 0xff),
      codec: "h264",
      ...(decodeTime === undefined
        ? {}
        : { decodeTimestampNs: BigInt(decodeTime) }),
      format: "h264",
      h264: keyframe
        ? {
            codecString,
            hasFrame: true,
            pps: Uint8Array.of(0x68, 0xce),
            sps: Uint8Array.of(0x67, 0x4d, 0, 0x1f),
          }
        : { hasFrame: true },
      keyframe,
      kind: VISUALIZATION_KIND.ENCODED_VIDEO,
      timestampNs: timeNs,
    } satisfies EncodedH264VideoVisualization,
    timeNs,
  };
}

function rangeReader(
  units: readonly H264AccessUnit[],
  gate?: Promise<void>,
): VideoAccessUnitReader {
  return {
    timelineStartTimeNs: 0n,
    read: async ({ endTimeNs, signal, startTimeNs }) => {
      await gate;
      if (signal.aborted) throw new Error("read aborted");
      return {
        complete: true,
        units: units.filter(
          (unit) => unit.timeNs >= startTimeNs && unit.timeNs <= endTimeNs,
        ),
      };
    },
  };
}

function readerForStreams(): VideoAccessUnitReader {
  return {
    timelineStartTimeNs: 0n,
    read: async ({ endTimeNs }) => ({
      complete: true,
      units: [accessUnit(Number(endTimeNs), true)],
    }),
  };
}

async function presented(
  lease: {
    readonly getSnapshot: () => { readonly presentedTimeNs: bigint | null };
  },
  timeNs: bigint,
): Promise<void> {
  await vi.waitFor(() =>
    expect(lease.getSnapshot().presentedTimeNs).toBe(timeNs),
  );
}

function fakeVideoFrame(): {
  readonly close: ReturnType<typeof vi.fn>;
  readonly frame: VideoFrame;
} {
  const close = vi.fn();
  return {
    close,
    frame: {
      close,
      codedHeight: 480,
      codedWidth: 640,
      displayHeight: 480,
      displayWidth: 640,
      timestamp: 0,
    } as unknown as VideoFrame,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, reject, resolve };
}

async function abortable<T>(
  promise: Promise<T>,
  signal: AbortSignal,
  honorAbort: boolean,
): Promise<T> {
  if (!honorAbort) return promise;
  if (signal.aborted) throw new VideoIntentCancelledError();
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      cleanup();
      reject(new VideoIntentCancelledError());
    };
    const cleanup = () => signal.removeEventListener("abort", onAbort);
    signal.addEventListener("abort", onAbort, { once: true });
    Promise.resolve(promise).then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error) => {
        cleanup();
        reject(error);
      },
    );
  });
}
