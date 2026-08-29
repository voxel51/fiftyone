import { VIDEO_ENCODED_ACCESS_UNIT_BYTE_CAP } from "./gop-index";
import type {
  EncodedVideoAccessUnit,
  VideoAccessUnitReader,
  VideoAccessUnitReadResult,
} from "./types";
import { VideoIntentCancelledError } from "./types";

const PUSH_VIDEO_ACCESS_UNIT_CAP = 4_096;
// Push-only sources have no EOF marker. One video-frame-scale quiet period
// closes an incomplete runway instead of spending the engine's full deadline.
const PUSH_VIDEO_QUIESCENCE_MS = 100;

interface StoredAccessUnit {
  readonly token: number;
  readonly unit: EncodedVideoAccessUnit;
}

interface StreamHistory {
  readonly entries: Map<bigint, StoredAccessUnit>;
  readonly sortedTimes: bigint[];
}

interface InsertionReference {
  readonly stream: string;
  readonly timeNs: bigint;
  readonly token: number;
}

/**
 * Bounded history for push-only consumers such as grid previews.
 *
 * The producer must push every access unit it observes before requesting its
 * presentation. A retained timestamp span is therefore a searched interval:
 * there may be ordinary timestamp gaps between frames, but no producer-known
 * access unit inside the span was skipped. Once an entry is evicted, reads
 * crossing the retained boundary become explicitly incomplete.
 */
export class PushVideoAccessUnitReader implements VideoAccessUnitReader {
  private bytes = 0;
  private readonly insertionOrder: InsertionReference[] = [];
  private nextToken = 0;
  private readonly pushListeners = new Set<() => void>();
  private readonly streams = new Map<string, StreamHistory>();
  private units = 0;

  constructor(
    private readonly unitCap = PUSH_VIDEO_ACCESS_UNIT_CAP,
    private readonly byteCap = VIDEO_ENCODED_ACCESS_UNIT_BYTE_CAP,
  ) {}

  get timelineStartTimeNs(): bigint | null {
    let start: bigint | null = null;
    for (const history of this.streams.values()) {
      const candidate = history.sortedTimes[0];
      if (candidate !== undefined && (start === null || candidate < start)) {
        start = candidate;
      }
    }
    return start;
  }

  get retainedBytes(): number {
    return this.bytes;
  }

  get retainedUnitCount(): number {
    return this.units;
  }

  hasRetainedKeyframeAtOrBefore(stream: string, timeNs: bigint): boolean {
    const history = this.streams.get(stream);
    if (!history) return false;
    for (
      let index = lowerBound(history.sortedTimes, timeNs + 1n) - 1;
      index >= 0;
      index -= 1
    ) {
      const entry = history.entries.get(history.sortedTimes[index]);
      if (entry?.unit.frame.keyframe) return true;
    }
    return false;
  }

  push(stream: string, unit: EncodedVideoAccessUnit): void {
    let history = this.streams.get(stream);
    if (!history) {
      history = { entries: new Map(), sortedTimes: [] };
      this.streams.set(stream, history);
    }
    const previous = history.entries.get(unit.timeNs);
    if (previous) {
      this.bytes -= previous.unit.frame.bytes.byteLength;
      const referenceIndex = this.insertionOrder.findIndex(
        (reference) =>
          reference.stream === stream &&
          reference.timeNs === unit.timeNs &&
          reference.token === previous.token,
      );
      if (referenceIndex >= 0) this.insertionOrder.splice(referenceIndex, 1);
    } else {
      history.sortedTimes.splice(
        lowerBound(history.sortedTimes, unit.timeNs),
        0,
        unit.timeNs,
      );
      this.units += 1;
    }
    const token = this.nextToken++;
    history.entries.set(unit.timeNs, { token, unit });
    this.insertionOrder.push({ stream, timeNs: unit.timeNs, token });
    this.bytes += unit.frame.bytes.byteLength;
    this.evictToBudget();
    this.notifyPushListeners();
  }

  async read({
    budget,
    endTimeNs,
    signal,
    startTimeNs,
    stream,
  }: Parameters<
    VideoAccessUnitReader["read"]
  >[0]): Promise<VideoAccessUnitReadResult> {
    for (;;) {
      if (signal.aborted) throw new VideoIntentCancelledError();
      const retained = this.readRetained(
        stream,
        startTimeNs,
        endTimeNs,
        budget.maxMessages,
        budget.maxObservedPayloadBytes,
      );
      if (
        retained.complete ||
        retained.stopReason === "push-budget" ||
        !retained.canGrowToComplete ||
        playbackNowMs() >= budget.deadlineMs
      ) {
        return retained.result;
      }
      const pushed = await this.waitForPush(
        signal,
        Math.min(budget.deadlineMs, playbackNowMs() + PUSH_VIDEO_QUIESCENCE_MS),
      );
      if (!pushed) return retained.result;
    }
  }

  clear(): void {
    this.bytes = 0;
    this.insertionOrder.length = 0;
    this.streams.clear();
    this.units = 0;
    this.notifyPushListeners();
  }

  private readRetained(
    stream: string,
    startTimeNs: bigint,
    endTimeNs: bigint,
    maxMessages: number,
    maxObservedPayloadBytes: number,
  ): {
    readonly canGrowToComplete: boolean;
    readonly complete: boolean;
    readonly result: VideoAccessUnitReadResult;
    readonly stopReason?: "push-budget" | "push-history";
  } {
    const history = this.streams.get(stream);
    const retainedStart = history?.sortedTimes[0];
    const retainedEnd = history?.sortedTimes.at(-1);
    if (!history || retainedStart === undefined || retainedEnd === undefined) {
      return {
        canGrowToComplete: false,
        complete: false,
        result: { complete: false, stopReason: "push-history", units: [] },
        stopReason: "push-history",
      };
    }

    const units: EncodedVideoAccessUnit[] = [];
    let observedBytes = 0;
    let budgetStopped = false;
    let index = lowerBound(history.sortedTimes, startTimeNs);
    while (index < history.sortedTimes.length) {
      const timeNs = history.sortedTimes[index];
      if (timeNs > endTimeNs) break;
      const unit = history.entries.get(timeNs)?.unit;
      index += 1;
      if (!unit) continue;
      const nextBytes = observedBytes + unit.frame.bytes.byteLength;
      if (units.length >= maxMessages || nextBytes > maxObservedPayloadBytes) {
        budgetStopped = true;
        break;
      }
      units.push(unit);
      observedBytes = nextBytes;
    }
    const complete =
      !budgetStopped &&
      startTimeNs >= retainedStart &&
      endTimeNs <= retainedEnd;
    const stopReason = budgetStopped ? "push-budget" : "push-history";
    return {
      canGrowToComplete:
        !budgetStopped &&
        startTimeNs >= retainedStart &&
        endTimeNs > retainedEnd,
      complete,
      result: {
        complete,
        ...(complete ? {} : { stopReason }),
        units,
      },
      ...(complete ? {} : { stopReason }),
    };
  }

  private waitForPush(
    signal: AbortSignal,
    deadlineMs: number,
  ): Promise<boolean> {
    if (signal.aborted) return Promise.reject(new VideoIntentCancelledError());
    return new Promise<boolean>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | null = null;
      const finish = () => {
        cleanup();
        resolve(true);
      };
      const quiesce = () => {
        cleanup();
        resolve(false);
      };
      const cancel = () => {
        cleanup();
        reject(new VideoIntentCancelledError());
      };
      const cleanup = () => {
        this.pushListeners.delete(finish);
        signal.removeEventListener("abort", cancel);
        if (timer !== null) clearTimeout(timer);
      };
      this.pushListeners.add(finish);
      signal.addEventListener("abort", cancel, { once: true });
      if (Number.isFinite(deadlineMs)) {
        timer = setTimeout(quiesce, Math.max(0, deadlineMs - playbackNowMs()));
      }
    });
  }

  private notifyPushListeners(): void {
    for (const listener of [...this.pushListeners]) listener();
  }

  private evictToBudget(): void {
    while (this.units > this.unitCap || this.bytes > this.byteCap) {
      const reference = this.insertionOrder.shift();
      if (!reference) break;
      const history = this.streams.get(reference.stream);
      const stored = history?.entries.get(reference.timeNs);
      if (!history || !stored || stored.token !== reference.token) continue;
      history.entries.delete(reference.timeNs);
      const index = lowerBound(history.sortedTimes, reference.timeNs);
      if (history.sortedTimes[index] === reference.timeNs) {
        history.sortedTimes.splice(index, 1);
      }
      this.bytes -= stored.unit.frame.bytes.byteLength;
      this.units -= 1;
      if (history.entries.size === 0) this.streams.delete(reference.stream);
    }
  }
}

function playbackNowMs(): number {
  return globalThis.performance?.now() ?? Date.now();
}

function lowerBound(times: readonly bigint[], timeNs: bigint): number {
  let low = 0;
  let high = times.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (times[middle] < timeNs) low = middle + 1;
    else high = middle;
  }
  return low;
}
