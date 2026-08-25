import { diagnosticMessage } from "../utils/errors";
import { VideoSeekAdmissionScheduler } from "./admission-scheduler";
import {
  EncodedAccessUnitCache,
  uniqueSortedAccessUnits,
  VideoGopIndex,
} from "./gop-index";
import type {
  H264AccessUnit,
  OwnedVideoPresentation,
  VideoAccessUnitReader,
  VideoDecoderActor,
  VideoEngineDependencies,
  VideoPlaybackIntent,
  VideoStreamSnapshot,
} from "./types";
import {
  VIDEO_INTENT_PRIORITY_WEIGHT,
  VideoDependencyWaitError,
  VideoIntentCancelledError,
} from "./types";

const NS_PER_SECOND = 1_000_000_000n;
const MAX_DIRECT_FORWARD_GAP_NS = 500_000_000n;
/** Forward presentation coverage retained while decoding reordered H.264. */
export const H264_REORDERED_DECODE_LOOKAHEAD_NS = 250_000_000n;
export const MAX_H264_GOP_ACCESS_UNITS = 4_096;
const VIDEO_SEEK_READ_POLICY = {
  initialLookbackNs: 15n * NS_PER_SECOND,
  maxLookbackNs: 120n * NS_PER_SECOND,
  maxMessages: MAX_H264_GOP_ACCESS_UNITS,
  maxObservedPayloadBytes: 128 * 1024 * 1024,
  maxWallTimeMs: 8_000,
} as const;

const INITIAL_SNAPSHOT: VideoStreamSnapshot = {
  diagnostic: null,
  generation: 0,
  phase: "idle",
  presentation: null,
  presentedTimeNs: null,
  targetTimeNs: null,
};

/** One source/stream cursor with one serialized decoder actor. */
export class VideoStreamEngine {
  private activeController: AbortController | null = null;
  private activeForwardPublicationProtected = false;
  private activeIntent: VideoPlaybackIntent | null = null;
  private readonly cache: EncodedAccessUnitCache;
  private closed = false;
  private continuityUncertain = false;
  private readonly decoder: VideoDecoderActor;
  private generation = 0;
  private readonly gopIndex: VideoGopIndex;
  private latestIntent: VideoPlaybackIntent | null = null;
  private readonly listeners = new Set<() => void>();
  private nominalForwardStepNs: bigint | null = null;
  private processing = false;
  private requestedPriority: VideoPlaybackIntent["priority"] | null = null;
  private requestedTargetTimeNs: bigint | null = null;
  private snapshot: VideoStreamSnapshot = INITIAL_SNAPSHOT;

  constructor(
    readonly stream: string,
    private readonly scheduler: VideoSeekAdmissionScheduler,
    private readonly reader: () => VideoAccessUnitReader | null,
    private readonly dependencies: VideoEngineDependencies,
  ) {
    this.gopIndex = new VideoGopIndex();
    this.cache = new EncodedAccessUnitCache(undefined, () =>
      this.gopIndex.invalidateCoverage(),
    );
    this.decoder = dependencies.createDecoder();
  }

  getSnapshot = (): VideoStreamSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  request(intent: VideoPlaybackIntent): void {
    if (this.closed) return;
    this.cache.put(intent);
    this.gopIndex.observe(intent);
    if (
      this.requestedTargetTimeNs === intent.timeNs &&
      (this.latestIntent !== null ||
        this.activeController !== null ||
        this.snapshot.presentedTimeNs === intent.timeNs)
    ) {
      // Duplicate 2D/3D/modal consumers share this authoritative intent.
      if (this.latestIntent) {
        this.latestIntent = strongerIntent(this.latestIntent, intent);
        this.requestedPriority = this.latestIntent.priority;
      } else if (
        this.requestedPriority === null ||
        VIDEO_INTENT_PRIORITY_WEIGHT[intent.priority] >
          VIDEO_INTENT_PRIORITY_WEIGHT[this.requestedPriority]
      ) {
        this.requestedPriority = intent.priority;
        if (this.activeIntent) {
          this.activeIntent = strongerIntent(this.activeIntent, intent);
        }
        if (this.activeController) {
          this.scheduler.promote(this.activeController.signal, intent.priority);
        }
      }
      return;
    }

    const retainActiveForwardPublication =
      this.shouldRetainActiveForwardPublication(intent.timeNs);
    this.requestedTargetTimeNs = intent.timeNs;
    this.requestedPriority = intent.priority;
    this.generation += 1;
    this.latestIntent = intent;
    if (
      this.activeController &&
      canPromoteActivePlaybackIntent(this.activeIntent, intent)
    ) {
      this.activeIntent = { ...this.activeIntent, priority: "playing" };
      this.scheduler.promote(this.activeController.signal, "playing");
    }
    if (this.activeController && !retainActiveForwardPublication) {
      this.continuityUncertain = true;
      this.activeController.abort();
    }
    this.publish({
      diagnostic: null,
      generation: this.generation,
      phase:
        this.decoder.cursorTimeNs === null ? "seeking.locating" : "forward",
      targetTimeNs: intent.timeNs,
    });
    if (retainActiveForwardPublication) return;
    void this.pump();
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.latestIntent = null;
    this.activeController?.abort();
    this.activeController = null;
    this.activeIntent = null;
    this.decoder.close();
    this.cache.clear();
    this.gopIndex.clear();
    const presentation = this.snapshot
      .presentation as OwnedVideoPresentation | null;
    this.snapshot = {
      ...this.snapshot,
      diagnostic: {
        code: "closed",
        message: "Video stream closed",
        severity: "info",
      },
      phase: "closed",
      presentation: null,
    };
    presentation?.releaseOwner();
    this.emit();
    this.listeners.clear();
  }

  private async pump(): Promise<void> {
    if (this.processing || this.closed) return;
    this.processing = true;
    try {
      while (!this.closed && this.latestIntent) {
        const intent = this.latestIntent;
        this.latestIntent = null;
        const generation = this.generation;
        const controller = new AbortController();
        this.activeController = controller;
        this.activeIntent = intent;
        try {
          await this.processIntent(intent, generation, controller.signal);
        } catch (error) {
          this.handleIntentError(error, generation, intent.timeNs);
        } finally {
          if (this.activeController === controller) {
            this.activeController = null;
            this.activeIntent = null;
          }
        }
      }
    } finally {
      this.processing = false;
      // A request can arrive between the loop condition and this assignment.
      if (this.latestIntent && !this.closed) void this.pump();
    }
  }

  private async processIntent(
    intent: VideoPlaybackIntent,
    generation: number,
    signal: AbortSignal,
  ): Promise<void> {
    let units: readonly H264AccessUnit[];
    let releaseAdmission: (() => void) | null = null;
    try {
      const cursorTimeNs = this.decoder.cursorTimeNs;
      const forwardGapNs =
        cursorTimeNs !== null && intent.timeNs > cursorTimeNs
          ? intent.timeNs - cursorTimeNs
          : null;
      const cadenceAllowsDirect =
        forwardGapNs !== null &&
        this.nominalForwardStepNs !== null &&
        forwardGapNs <=
          this.nominalForwardStepNs + this.nominalForwardStepNs / 2n;
      const targetDecodeTimeNs = intent.frame.decodeTimestampNs;
      const decodeCadenceAllowsDirect =
        targetDecodeTimeNs === undefined ||
        this.decoder.hasReadyPresentation(intent.timeNs);
      const reorderedKeyframeNeedsRunway =
        intent.frame.keyframe &&
        targetDecodeTimeNs !== undefined &&
        Boolean(this.reader());
      const directForward =
        cursorTimeNs !== null &&
        forwardGapNs !== null &&
        forwardGapNs <= MAX_DIRECT_FORWARD_GAP_NS &&
        (!this.reader() || cadenceAllowsDirect) &&
        decodeCadenceAllowsDirect &&
        !this.continuityUncertain;
      const directKeyframe =
        intent.frame.keyframe &&
        !reorderedKeyframeNeedsRunway &&
        (cursorTimeNs === null || intent.timeNs > cursorTimeNs);
      const keyframeOnlyDiscontinuity =
        intent.frame.keyframe &&
        !reorderedKeyframeNeedsRunway &&
        !directKeyframe &&
        !directForward;
      if (directKeyframe || directForward) {
        units = [intent];
        this.continuityUncertain = false;
        this.publishIfCurrent(generation, {
          diagnostic: null,
          phase: "forward",
        });
      } else if (keyframeOnlyDiscontinuity) {
        units = [intent];
        this.decoder.resetForDiscontinuity();
        this.continuityUncertain = false;
        this.publishIfCurrent(generation, {
          diagnostic: null,
          phase: "seeking.prerolling",
        });
      } else {
        this.publishIfCurrent(generation, {
          diagnostic: {
            code: "capacity",
            message: "Waiting for H.264 seek capacity",
            severity: "info",
          },
          phase: "waiting-for-capacity",
        });
        releaseAdmission = await this.scheduler.acquire(
          intent.priority,
          signal,
        );
        if (signal.aborted) throw new VideoIntentCancelledError();

        if (reorderedKeyframeNeedsRunway) {
          units = await this.buildSeekRunway(intent, signal, generation);
          this.observeForwardCadence(null, units);
          if (this.decoder.configuredCodec !== null) {
            this.decoder.resetForDiscontinuity();
          }
        } else if (
          cursorTimeNs !== null &&
          intent.timeNs > cursorTimeNs &&
          !this.continuityUncertain
        ) {
          this.publishIfCurrent(generation, {
            diagnostic: null,
            phase: "seeking.reading",
          });
          units = await this.readForwardChain(cursorTimeNs, intent, signal);
          this.observeForwardCadence(cursorTimeNs, units);
          const knownSameEpoch = this.gopIndex.sameEpoch(
            cursorTimeNs,
            intent.timeNs,
          );
          if (!knownSameEpoch && units.some((unit) => unit.frame.keyframe)) {
            this.decoder.resetForDiscontinuity();
            units = runwayStartingAtLastKeyframe(units, intent.timeNs);
          }
        } else {
          this.publishIfCurrent(generation, {
            diagnostic: null,
            phase: "seeking.locating",
          });
          units = await this.buildSeekRunway(intent, signal, generation);
          this.observeForwardCadence(null, units);
          this.decoder.resetForDiscontinuity();
        }
        this.continuityUncertain = false;
        this.publishIfCurrent(generation, {
          diagnostic: null,
          phase: "seeking.prerolling",
        });
      }

      this.activeForwardPublicationProtected = true;
      const decoded = await this.decodeWithOneRecovery(
        units,
        intent,
        generation,
        signal,
      );
      if (directForward) this.observeForwardCadence(cursorTimeNs, units);
      if (signal.aborted) {
        decoded.close();
        throw new VideoIntentCancelledError();
      }
      let presentation: OwnedVideoPresentation;
      try {
        presentation = await this.dependencies.copyPresentation(
          decoded,
          intent.timeNs,
        );
      } catch (error) {
        // The dependency contract owns the frame, but close defensively so a
        // faulty adapter cannot pin the decoder surface pool on rejection.
        decoded.close();
        throw error;
      }
      if (signal.aborted || this.closed) {
        presentation.releaseOwner();
        throw new VideoIntentCancelledError();
      }
      const previous = this.snapshot
        .presentation as OwnedVideoPresentation | null;
      const publicationGeneration = this.generation;
      this.snapshot = {
        diagnostic: null,
        generation: publicationGeneration,
        phase: "forward",
        presentation,
        presentedTimeNs: intent.timeNs,
        targetTimeNs: this.requestedTargetTimeNs ?? intent.timeNs,
      };
      this.emit();
      previous?.releaseOwner();
    } finally {
      this.activeForwardPublicationProtected = false;
      releaseAdmission?.();
    }
  }

  private shouldRetainActiveForwardPublication(timeNs: bigint): boolean {
    const previousTargetTimeNs = this.requestedTargetTimeNs;
    return (
      this.activeController !== null &&
      this.activeForwardPublicationProtected &&
      previousTargetTimeNs !== null &&
      timeNs > previousTargetTimeNs &&
      timeNs - previousTargetTimeNs <= MAX_DIRECT_FORWARD_GAP_NS
    );
  }

  private async decodeWithOneRecovery(
    units: readonly H264AccessUnit[],
    intent: VideoPlaybackIntent,
    generation: number,
    signal: AbortSignal,
  ): Promise<VideoFrame> {
    try {
      return await this.decoder.decode(units, {
        signal,
        targetTimeNs: intent.timeNs,
      });
    } catch (error) {
      if (
        signal.aborted ||
        error instanceof VideoIntentCancelledError ||
        error instanceof VideoDependencyWaitError
      ) {
        throw error;
      }
      this.publishIfCurrent(generation, {
        diagnostic: {
          code: "decode",
          message: "Retrying H.264 decoder after a terminal failure",
          severity: "info",
        },
        phase: "seeking.locating",
      });
      this.decoder.resetForDiscontinuity();
      const recovery = await this.buildSeekRunway(intent, signal, generation);
      return this.decoder.decode(recovery, {
        signal,
        targetTimeNs: intent.timeNs,
      });
    }
  }

  private async readForwardChain(
    cursorTimeNs: bigint,
    intent: VideoPlaybackIntent,
    signal: AbortSignal,
  ): Promise<readonly H264AccessUnit[]> {
    const reader = this.reader();
    if (!reader) {
      throw new VideoDependencyWaitError(
        "Waiting for an H.264 access unit reader",
      );
    }
    const startTimeNs = cursorTimeNs + 1n;
    const targetDecodeTimeNs = intent.frame.decodeTimestampNs;
    const cursorDecodeTimeNs = this.decoder.cursorDecodeTimeNs;
    const reorderedForwardRead =
      targetDecodeTimeNs !== undefined && cursorDecodeTimeNs !== null;
    const endTimeNs = reorderedForwardRead
      ? intent.timeNs + H264_REORDERED_DECODE_LOOKAHEAD_NS
      : intent.timeNs;
    const read = await this.readRange(reader, startTimeNs, endTimeNs, signal);
    const decodeEndTimeNs = maxDecodeTimeNs([...read, intent]);
    const units =
      reorderedForwardRead && decodeEndTimeNs !== null
        ? uniqueDecodeSortedAccessUnits([
            ...this.cache.rangeByDecodeTime(
              cursorDecodeTimeNs + 1n,
              decodeEndTimeNs,
            ),
            ...read,
            intent,
          ]).filter(
            (unit) =>
              (unit.frame.decodeTimestampNs ?? unit.timeNs) >
                cursorDecodeTimeNs || unit.timeNs === intent.timeNs,
          )
        : uniqueSortedAccessUnits([
            ...this.cache.range(startTimeNs, intent.timeNs),
            ...read,
            intent,
          ]);
    if (!units.some((unit) => unit.timeNs === intent.timeNs)) {
      throw new VideoDependencyWaitError("Waiting for the H.264 seek target");
    }
    if (units.length > MAX_H264_GOP_ACCESS_UNITS) {
      throw new VideoDependencyWaitError(
        "H.264 dependency chain exceeds the bounded decode budget",
      );
    }
    return units;
  }

  /** Learns the smallest complete positive access-unit step for this stream. */
  private observeForwardCadence(
    previousTimeNs: bigint | null,
    units: readonly H264AccessUnit[],
  ): void {
    let previous = previousTimeNs;
    for (const unit of uniqueSortedAccessUnits(units)) {
      if (previous !== null && unit.timeNs > previous) {
        const step = unit.timeNs - previous;
        if (
          this.nominalForwardStepNs === null ||
          step < this.nominalForwardStepNs
        ) {
          this.nominalForwardStepNs = step;
        }
      }
      previous = unit.timeNs;
    }
  }

  private async buildSeekRunway(
    intent: VideoPlaybackIntent,
    signal: AbortSignal,
    generation: number,
  ): Promise<readonly H264AccessUnit[]> {
    const runwayEndTimeNs =
      intent.frame.decodeTimestampNs === undefined
        ? intent.timeNs
        : intent.timeNs + H264_REORDERED_DECODE_LOOKAHEAD_NS;
    if (intent.frame.keyframe) {
      if (intent.frame.decodeTimestampNs === undefined) return [intent];
      const reader = this.reader();
      if (!reader) return [intent];
      this.publishIfCurrent(generation, { phase: "seeking.reading" });
      const read = await this.readRange(
        reader,
        intent.timeNs,
        runwayEndTimeNs,
        signal,
      );
      const units = uniqueDecodeSortedAccessUnits([intent, ...read]);
      if (!units[0]?.frame.keyframe || units[0].timeNs !== intent.timeNs) {
        throw new VideoDependencyWaitError(
          "Waiting for the H.264 runway keyframe",
        );
      }
      if (units.length > MAX_H264_GOP_ACCESS_UNITS) {
        throw new VideoDependencyWaitError(
          "H.264 dependency chain exceeds the bounded decode budget",
        );
      }
      return units;
    }
    const reader = this.reader();
    if (!reader || reader.timelineStartTimeNs === null) {
      throw new VideoDependencyWaitError("Waiting for an H.264 keyframe");
    }
    const knownKeyframe = this.gopIndex.keyframeTimeAtOrBefore(intent.timeNs);
    if (knownKeyframe !== null) {
      this.publishIfCurrent(generation, { phase: "seeking.reading" });
      await this.readRange(reader, knownKeyframe, runwayEndTimeNs, signal);
      return this.validatedRunway(knownKeyframe, runwayEndTimeNs, intent);
    }

    const timelineStartNs = reader.timelineStartTimeNs;
    const cumulativeLookbacks: bigint[] = [];
    for (
      let lookbackNs = VIDEO_SEEK_READ_POLICY.initialLookbackNs;
      lookbackNs < VIDEO_SEEK_READ_POLICY.maxLookbackNs;
      lookbackNs *= 2n
    ) {
      cumulativeLookbacks.push(lookbackNs);
    }
    cumulativeLookbacks.push(VIDEO_SEEK_READ_POLICY.maxLookbackNs);
    const knownNegativeStart = this.gopIndex.deepestKnownKeyframeFreeStart(
      intent.timeNs - 1n,
    );
    let endTimeNs =
      knownNegativeStart !== null
        ? knownNegativeStart - 1n
        : intent.timeNs - 1n;
    for (const lookbackNs of cumulativeLookbacks) {
      if (signal.aborted) throw new VideoIntentCancelledError();
      if (endTimeNs < timelineStartNs) break;
      const requestedStart = intent.timeNs - lookbackNs;
      const startTimeNs =
        requestedStart > timelineStartNs ? requestedStart : timelineStartNs;
      if (startTimeNs > endTimeNs) continue;
      this.publishIfCurrent(generation, { phase: "seeking.reading" });
      await this.readRange(reader, startTimeNs, endTimeNs, signal);
      const keyframe = this.gopIndex.keyframeTimeAtOrBefore(intent.timeNs);
      if (keyframe !== null && keyframe >= startTimeNs) {
        // The lookback found the GOP. Re-read it through a bounded successor
        // window so reordered targets can leave the browser decoder.
        await this.readRange(reader, keyframe, runwayEndTimeNs, signal);
        return this.validatedRunway(keyframe, runwayEndTimeNs, intent);
      }
      if (startTimeNs === timelineStartNs) break;
      endTimeNs = startTimeNs - 1n;
    }
    throw new VideoDependencyWaitError(
      "No H.264 keyframe was found within the bounded lookback",
    );
  }

  private validatedRunway(
    keyframeTimeNs: bigint,
    runwayEndTimeNs: bigint,
    intent: VideoPlaybackIntent,
  ): readonly H264AccessUnit[] {
    if (
      keyframeTimeNs < intent.timeNs &&
      !this.gopIndex.covers(keyframeTimeNs, intent.timeNs - 1n)
    ) {
      throw new VideoDependencyWaitError(
        "Waiting for complete H.264 runway coverage",
      );
    }
    const keyframe = this.cache.get(keyframeTimeNs);
    const targetDecodeTimeNs = intent.frame.decodeTimestampNs;
    const keyframeDecodeTimeNs = keyframe?.frame.decodeTimestampNs;
    const runwayDecodeEndTimeNs = maxDecodeTimeNs(
      this.cache.range(keyframeTimeNs, runwayEndTimeNs),
    );
    const units =
      targetDecodeTimeNs !== undefined &&
      keyframeDecodeTimeNs !== undefined &&
      runwayDecodeEndTimeNs !== null
        ? uniqueDecodeSortedAccessUnits([
            ...this.cache.rangeByDecodeTime(
              keyframeDecodeTimeNs,
              runwayDecodeEndTimeNs,
            ),
            intent,
          ])
        : uniqueSortedAccessUnits([
            ...this.cache.range(keyframeTimeNs, intent.timeNs),
            intent,
          ]);
    if (!units[0]?.frame.keyframe || units[0].timeNs !== keyframeTimeNs) {
      throw new VideoDependencyWaitError(
        "Waiting for the H.264 runway keyframe",
      );
    }
    if (!units.some((unit) => unit.timeNs === intent.timeNs)) {
      throw new VideoDependencyWaitError("Waiting for the H.264 runway target");
    }
    if (units.length > MAX_H264_GOP_ACCESS_UNITS) {
      throw new VideoDependencyWaitError(
        "H.264 dependency chain exceeds the bounded decode budget",
      );
    }
    return units;
  }

  private async readRange(
    reader: VideoAccessUnitReader,
    startTimeNs: bigint,
    endTimeNs: bigint,
    signal: AbortSignal,
  ): Promise<readonly H264AccessUnit[]> {
    const result = await reader.read({
      budget: {
        deadlineMs:
          this.dependencies.nowMs() + VIDEO_SEEK_READ_POLICY.maxWallTimeMs,
        maxMessages: VIDEO_SEEK_READ_POLICY.maxMessages,
        maxObservedPayloadBytes: VIDEO_SEEK_READ_POLICY.maxObservedPayloadBytes,
      },
      endTimeNs,
      signal,
      startTimeNs,
      stream: this.stream,
    });
    if (signal.aborted) throw new VideoIntentCancelledError();
    this.cache.putAll(result.units);
    for (const unit of result.units) this.gopIndex.observe(unit);
    if (!result.complete) {
      throw new VideoDependencyWaitError(
        `H.264 runway read stopped at ${result.stopReason ?? "its budget"}`,
      );
    }
    if (result.units.every((unit) => this.cache.has(unit.timeNs))) {
      this.gopIndex.recordReadCoverage(startTimeNs, endTimeNs, result.units);
    }
    return result.units;
  }

  private handleIntentError(
    error: unknown,
    generation: number,
    targetTimeNs: bigint,
  ): void {
    if (
      this.closed ||
      generation !== this.generation ||
      error instanceof VideoIntentCancelledError
    ) {
      return;
    }
    if (error instanceof VideoDependencyWaitError) {
      this.publish({
        diagnostic: {
          code: "dependency",
          message: error.message,
          severity: "info",
        },
        generation,
        phase: "waiting-for-keyframe",
        targetTimeNs,
      });
      return;
    }
    this.publish({
      diagnostic: {
        code: "decode",
        message: diagnosticMessage(error, "H.264 decoder failed"),
        severity: "error",
      },
      generation,
      phase: "faulted",
      targetTimeNs,
    });
  }

  private publishIfCurrent(
    generation: number,
    update: Partial<VideoStreamSnapshot>,
  ): void {
    if (generation !== this.generation || this.closed) return;
    this.publish(update);
  }

  private publish(update: Partial<VideoStreamSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...update };
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}

function runwayStartingAtLastKeyframe(
  units: readonly H264AccessUnit[],
  targetTimeNs: bigint,
): readonly H264AccessUnit[] {
  let lastKeyframe = -1;
  units.forEach((unit, index) => {
    if (unit.timeNs <= targetTimeNs && unit.frame.keyframe)
      lastKeyframe = index;
  });
  if (lastKeyframe < 0) {
    throw new VideoDependencyWaitError("Waiting for an H.264 keyframe");
  }
  const runway = units.slice(lastKeyframe);
  if (runway.at(-1)?.timeNs !== targetTimeNs) {
    throw new VideoDependencyWaitError("Waiting for the H.264 seek target");
  }
  return runway;
}

function strongerIntent(
  current: VideoPlaybackIntent,
  candidate: VideoPlaybackIntent,
): VideoPlaybackIntent {
  return VIDEO_INTENT_PRIORITY_WEIGHT[candidate.priority] >
    VIDEO_INTENT_PRIORITY_WEIGHT[current.priority]
    ? candidate
    : current;
}

function canPromoteActivePlaybackIntent(
  active: VideoPlaybackIntent | null,
  requested: VideoPlaybackIntent,
): active is VideoPlaybackIntent {
  return Boolean(
    active &&
    active.priority !== "playing" &&
    requested.priority === "playing" &&
    !requested.frame.keyframe &&
    requested.timeNs > active.timeNs &&
    requested.timeNs - active.timeNs <= MAX_DIRECT_FORWARD_GAP_NS,
  );
}
function uniqueDecodeSortedAccessUnits(
  units: readonly H264AccessUnit[],
): H264AccessUnit[] {
  const byTime = new Map<bigint, H264AccessUnit>();
  for (const unit of units) byTime.set(unit.timeNs, unit);
  return [...byTime.values()].sort((left, right) => {
    const leftTimeNs = left.frame.decodeTimestampNs ?? left.timeNs;
    const rightTimeNs = right.frame.decodeTimestampNs ?? right.timeNs;
    return leftTimeNs < rightTimeNs
      ? -1
      : leftTimeNs > rightTimeNs
        ? 1
        : left.timeNs < right.timeNs
          ? -1
          : left.timeNs > right.timeNs
            ? 1
            : 0;
  });
}

function maxDecodeTimeNs(units: readonly H264AccessUnit[]): bigint | null {
  let maximum: bigint | null = null;
  for (const unit of units) {
    const decodeTimeNs = unit.frame.decodeTimestampNs ?? unit.timeNs;
    if (maximum === null || decodeTimeNs > maximum) maximum = decodeTimeNs;
  }
  return maximum;
}
