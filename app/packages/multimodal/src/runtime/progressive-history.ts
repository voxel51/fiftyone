import type { TimeWindow } from "../ir";
import type {
  BudgetedReadJob,
  BudgetedReadResult,
  EpisodeSession,
  FrameBatch,
  ReadContinuation,
  ReadPriority,
  ReadWorkBudget,
  SourceReadBudgetAccount,
} from "../ports";
import { isEpisodeReadCancelledError } from "../ports";
import { addCoveredRange } from "./numeric-series-window";

export type ProgressiveHistoryFamily = "log" | "pose" | "scene-update";
export type ProgressiveHistoryStatus =
  | "idle"
  | "loading"
  | "complete"
  | "truncated"
  | "error";

export type ProgressiveHistoryTerminalCause =
  | "account-exhausted"
  | "fallback-message-cap"
  | "item-cap"
  | "source-exhausted"
  | "source-unit-unavailable"
  | "zero-progress";

export interface ProgressiveHistorySnapshot<T> {
  readonly coverageByStream: ReadonlyMap<string, readonly TimeWindow[]>;
  readonly error?: string;
  readonly itemCount: number;
  readonly nextUnreadNs?: bigint;
  readonly revision: number;
  readonly status: ProgressiveHistoryStatus;
  readonly terminalCause?: ProgressiveHistoryTerminalCause;
  readonly truncated: boolean;
  readonly unavailableByStream: ReadonlyMap<string, readonly TimeWindow[]>;
  readonly value: T;
}

export interface ProgressiveHistoryAccumulator<T> {
  readonly consume: (
    current: T,
    batches: readonly FrameBatch[],
  ) => { readonly itemCount: number; readonly value: T };
  readonly initialValue: T;
}

export interface ProgressiveHistoryJobConfig<T> {
  readonly accumulator: ProgressiveHistoryAccumulator<T>;
  readonly budget: ReadWorkBudget;
  readonly fallback: {
    readonly maxMessagesPerStream: number;
    readonly tileDurationNs: bigint;
  };
  readonly family: ProgressiveHistoryFamily;
  /** Logical identity within one session; physical read settings are also keyed. */
  readonly key: string;
  readonly maxItems: number;
  readonly preferredTimeNs?: bigint;
  readonly priority?: ReadPriority;
  readonly streams: readonly string[];
  readonly traversal: "center-out" | "chronological";
  readonly window: TimeWindow;
}

export interface ProgressiveHistoryDemand {
  readonly retryDelayMs: number;
  readonly shouldStandDown: () => boolean;
}

export interface ProgressiveHistoryJob<T> {
  acquire(demand: ProgressiveHistoryDemand): () => void;
  snapshot(): ProgressiveHistorySnapshot<T>;
  subscribe(listener: () => void): () => void;
}

interface GenericTile {
  readonly stream: string;
  readonly window: TimeWindow;
}

const MAX_RETAINED_HISTORY_JOBS = 32;
const accumulatorIds = new WeakMap<object, number>();
let nextAccumulatorId = 1;
const sessionHubs = new WeakMap<
  EpisodeSession,
  {
    readonly bounded: WeakMap<SourceReadBudgetAccount, ProgressiveHistoryHub>;
    generic?: ProgressiveHistoryHub;
  }
>();

/** A stable identity for every setting that changes a retained read's meaning. */
export function progressiveHistoryConfigIdentity<T>(
  config: ProgressiveHistoryJobConfig<T>,
): string {
  let accumulatorId = accumulatorIds.get(config.accumulator);
  if (accumulatorId === undefined) {
    accumulatorId = nextAccumulatorId++;
    accumulatorIds.set(config.accumulator, accumulatorId);
  }
  return encodeIdentityParts([
    accumulatorId,
    config.family,
    config.key,
    config.streams.length,
    ...config.streams,
    config.window.startNs,
    config.window.endNs,
    config.traversal,
    config.preferredTimeNs ?? "",
    config.priority ?? "",
    config.budget.maxMessages,
    config.budget.maxSourceBytes,
    config.budget.maxUncompressedBytes,
    config.budget.maxWallTimeMs,
    config.fallback.maxMessagesPerStream,
    config.fallback.tileDurationNs,
    config.maxItems,
  ]);
}

/** Returns the history hub whose lifetime and charged work follow a session. */
export function getProgressiveHistoryJob<T>(
  session: EpisodeSession,
  account: SourceReadBudgetAccount | null | undefined,
  config: ProgressiveHistoryJobConfig<T>,
): ProgressiveHistoryJob<T> {
  let hubs = sessionHubs.get(session);
  if (!hubs) {
    hubs = { bounded: new WeakMap() };
    sessionHubs.set(session, hubs);
  }
  let hub = account ? hubs.bounded.get(account) : hubs.generic;
  if (!hub) {
    hub = new ProgressiveHistoryHub(session, account ?? null);
    if (account) hubs.bounded.set(account, hub);
    else hubs.generic = hub;
  }
  return hub.get(config);
}

/** Testable source-scoped scheduler and retained job cache. */
export class ProgressiveHistoryHub {
  private active: InternalProgressiveHistoryJob<unknown> | undefined;
  private lastUsed = 0;
  private readonly jobs = new Map<
    string,
    InternalProgressiveHistoryJob<unknown>
  >();
  private readonly runnable: InternalProgressiveHistoryJob<unknown>[] = [];
  private retryAtMs: number | undefined;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private running = false;

  constructor(
    private readonly session: EpisodeSession,
    private readonly account: SourceReadBudgetAccount | null,
  ) {}

  get<T>(config: ProgressiveHistoryJobConfig<T>): ProgressiveHistoryJob<T> {
    const cacheKey = progressiveHistoryConfigIdentity(config);
    const existing = this.jobs.get(cacheKey) as
      | InternalProgressiveHistoryJob<T>
      | undefined;
    if (existing) {
      existing.lastUsed = ++this.lastUsed;
      return existing;
    }
    const job = new InternalProgressiveHistoryJob({
      account: this.account,
      config,
      enqueue: (candidate) => this.enqueue(candidate),
      session: this.session,
    });
    job.lastUsed = ++this.lastUsed;
    this.jobs.set(cacheKey, job as InternalProgressiveHistoryJob<unknown>);
    this.prune();
    return job;
  }

  private enqueue(job: InternalProgressiveHistoryJob<unknown>): void {
    if (!job.isDemanded() || job.isTerminal() || job.queued) return;
    job.queued = true;
    this.runnable.push(job);
    void this.pump();
  }

  private async pump(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      while (this.runnable.length > 0) {
        const job = this.runnable.shift();
        if (!job) continue;
        job.queued = false;
        if (!job.isDemanded() || job.isTerminal()) continue;
        if (job.shouldStandDown()) {
          this.scheduleRetry(job.retryDelayMs());
          continue;
        }
        this.active = job;
        await job.step();
        this.active = undefined;
        if (job.isDemanded() && !job.isTerminal()) this.enqueue(job);
      }
    } finally {
      this.active = undefined;
      this.running = false;
      if (this.runnable.length > 0) void this.pump();
    }
  }

  private scheduleRetry(delayMs: number): void {
    const retryAtMs = Date.now() + delayMs;
    if (this.retryTimer !== undefined && (this.retryAtMs ?? 0) <= retryAtMs) {
      return;
    }
    if (this.retryTimer !== undefined) clearTimeout(this.retryTimer);
    this.retryAtMs = retryAtMs;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined;
      this.retryAtMs = undefined;
      for (const job of this.jobs.values()) this.enqueue(job);
    }, delayMs);
  }

  private prune(): void {
    while (this.jobs.size > MAX_RETAINED_HISTORY_JOBS) {
      const candidate = [...this.jobs.entries()]
        .filter(([, job]) => !job.isDemanded() && job !== this.active)
        .sort((left, right) => left[1].lastUsed - right[1].lastUsed)[0];
      if (!candidate) return;
      candidate[1].dispose();
      this.jobs.delete(candidate[0]);
    }
  }
}

class InternalProgressiveHistoryJob<T> implements ProgressiveHistoryJob<T> {
  private readonly boundedJob: BudgetedReadJob | undefined;
  private continuation: ReadContinuation | undefined;
  private readonly coverageByStream = new Map<string, TimeWindow[]>();
  private readonly demands = new Map<symbol, ProgressiveHistoryDemand>();
  private genericController: AbortController | undefined;
  private readonly genericTiles: GenericTileCursor<T> | undefined;
  private readonly listeners = new Set<() => void>();
  private skipOversizedSourceUnit = false;
  private zeroProgressResults = 0;
  private snapshotValue: ProgressiveHistorySnapshot<T>;
  private readonly unavailableByStream = new Map<string, TimeWindow[]>();
  lastUsed = 0;
  queued = false;

  constructor({
    account,
    config,
    enqueue,
    session,
  }: {
    readonly account: SourceReadBudgetAccount | null;
    readonly config: ProgressiveHistoryJobConfig<T>;
    readonly enqueue: (job: InternalProgressiveHistoryJob<unknown>) => void;
    readonly session: EpisodeSession;
  }) {
    this.config = config;
    this.enqueueSelf = () =>
      enqueue(this as InternalProgressiveHistoryJob<unknown>);
    this.session = session;
    this.boundedJob = account?.createJob();
    this.genericTiles = this.boundedJob
      ? undefined
      : new GenericTileCursor(config);
    this.snapshotValue = {
      coverageByStream: new Map(),
      itemCount: 0,
      revision: 0,
      status: "idle",
      truncated: false,
      unavailableByStream: new Map(),
      value: config.accumulator.initialValue,
    };
  }

  private readonly config: ProgressiveHistoryJobConfig<T>;
  private readonly enqueueSelf: () => void;
  private readonly session: EpisodeSession;

  acquire(demand: ProgressiveHistoryDemand): () => void {
    const token = Symbol(this.config.family);
    this.demands.set(token, demand);
    this.enqueueSelf();
    return () => {
      this.demands.delete(token);
      if (this.demands.size === 0 && !this.boundedJob) {
        this.genericController?.abort();
      }
    };
  }

  snapshot(): ProgressiveHistorySnapshot<T> {
    return this.snapshotValue;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  isDemanded(): boolean {
    return this.demands.size > 0;
  }

  isTerminal(): boolean {
    return (
      this.snapshotValue.status === "complete" ||
      this.snapshotValue.status === "truncated" ||
      this.snapshotValue.status === "error"
    );
  }

  retryDelayMs(): number {
    return Math.min(
      ...[...this.demands.values()].map((demand) => demand.retryDelayMs),
    );
  }

  shouldStandDown(): boolean {
    return (
      this.demands.size > 0 &&
      [...this.demands.values()].every((demand) => demand.shouldStandDown())
    );
  }

  async step(): Promise<void> {
    if (this.isTerminal() || !this.isDemanded()) return;
    if (this.snapshotValue.status === "idle") {
      this.publish({ status: "loading" });
    }
    try {
      if (this.boundedJob) await this.stepBounded(this.boundedJob);
      else await this.stepGeneric();
    } catch (error) {
      if (
        isEpisodeReadCancelledError(error) ||
        this.genericController?.signal.aborted
      ) {
        return;
      }
      this.publish({
        error: error instanceof Error ? error.message : String(error),
        status: "error",
      });
    }
  }

  dispose(): void {
    this.genericController?.abort();
    this.demands.clear();
    this.listeners.clear();
  }

  private async stepBounded(job: BudgetedReadJob): Promise<void> {
    const result = await job.read({
      budget: this.config.budget,
      ...(this.continuation ? { continuation: this.continuation } : {}),
      ...(this.config.preferredTimeNs !== undefined
        ? { preferredTimeNs: this.config.preferredTimeNs }
        : {}),
      ...(this.skipOversizedSourceUnit
        ? { skipOversizedSourceUnit: true }
        : {}),
      streams: this.config.streams,
      window: this.config.window,
    });
    const progressed = boundedResultMadeProgress(result);
    this.zeroProgressResults = progressed ? 0 : this.zeroProgressResults + 1;
    this.continuation = result.continuation;
    this.mergeRanges(this.coverageByStream, result.coverageByStream);
    this.mergeRanges(
      this.unavailableByStream,
      result.unavailableByStream ?? new Map(),
    );
    const accumulated = this.config.accumulator.consume(
      this.snapshotValue.value,
      result.batches,
    );
    const truncated =
      this.snapshotValue.truncated || this.hasUnavailableCoverage();
    this.publish({
      itemCount: accumulated.itemCount,
      nextUnreadNs:
        result.stopReason === "source-exhausted"
          ? this.config.window.endNs + 1n
          : (result.resumeAtNs ?? this.snapshotValue.nextUnreadNs),
      truncated,
      value: accumulated.value,
    });

    if (accumulated.itemCount >= this.config.maxItems) {
      this.publish({
        status: "truncated",
        terminalCause: "item-cap",
        truncated: true,
      });
      return;
    }
    if (result.stopReason === "account-exhausted") {
      this.publish({
        status: "truncated",
        terminalCause: "account-exhausted",
        truncated: true,
      });
      return;
    }
    if (result.stopReason === "source-exhausted") {
      this.publish({
        status: truncated ? "truncated" : "complete",
        terminalCause: truncated
          ? "source-unit-unavailable"
          : "source-exhausted",
      });
      return;
    }
    if (result.stopReason === "oversized-source-unit") {
      this.skipOversizedSourceUnit = false;
      if (!this.continuation || this.zeroProgressResults >= 2) {
        this.publish({
          status: "truncated",
          terminalCause: this.continuation
            ? "zero-progress"
            : "source-unit-unavailable",
          truncated: true,
        });
      }
      return;
    }
    if (!progressed && result.stopReason === "budget-exhausted") {
      if (this.skipOversizedSourceUnit || !this.continuation) {
        this.publish({
          status: "truncated",
          terminalCause: "zero-progress",
          truncated: true,
        });
      } else {
        this.skipOversizedSourceUnit = true;
      }
      return;
    }
    this.skipOversizedSourceUnit = false;
  }

  private async stepGeneric(): Promise<void> {
    const tile = this.genericTiles?.peek();
    if (!tile) {
      this.publish({
        status: this.snapshotValue.truncated ? "truncated" : "complete",
        terminalCause: this.snapshotValue.truncated
          ? "fallback-message-cap"
          : "source-exhausted",
      });
      return;
    }
    const controller = new AbortController();
    this.genericController = controller;
    const batches: FrameBatch[] = [];
    let count = 0;
    try {
      for await (const batch of this.session.read({
        limit: this.config.fallback.maxMessagesPerStream,
        priority: this.config.priority ?? "bulk",
        signal: controller.signal,
        streams: [tile.stream],
        window: tile.window,
      })) {
        if (controller.signal.aborted || this.shouldStandDown()) {
          controller.abort();
          return;
        }
        batches.push(batch);
        count += batch.frames.length;
        if (count >= this.config.fallback.maxMessagesPerStream) break;
      }
    } finally {
      if (this.genericController === controller) {
        this.genericController = undefined;
      }
    }
    if (controller.signal.aborted) return;

    const capped = count >= this.config.fallback.maxMessagesPerStream;
    this.mergeRanges(
      capped ? this.unavailableByStream : this.coverageByStream,
      new Map([[tile.stream, [tile.window]]]),
    );
    const accumulated = this.config.accumulator.consume(
      this.snapshotValue.value,
      batches,
    );
    this.genericTiles?.advance();
    const truncated = this.snapshotValue.truncated || capped;
    this.publish({
      itemCount: accumulated.itemCount,
      nextUnreadNs:
        this.genericTiles?.peek()?.window.startNs ??
        this.config.window.endNs + 1n,
      truncated,
      value: accumulated.value,
    });
    if (accumulated.itemCount >= this.config.maxItems) {
      this.publish({
        status: "truncated",
        terminalCause: "item-cap",
        truncated: true,
      });
    }
  }

  private mergeRanges(
    target: Map<string, TimeWindow[]>,
    additions: ReadonlyMap<string, readonly TimeWindow[]>,
  ): void {
    for (const [stream, ranges] of additions) {
      if (ranges.length === 0 && !target.has(stream)) continue;
      let merged = target.get(stream) ?? [];
      for (const range of ranges) merged = addCoveredRange(merged, range);
      target.set(stream, merged);
    }
  }

  private hasUnavailableCoverage(): boolean {
    for (const ranges of this.unavailableByStream.values()) {
      if (ranges.length > 0) return true;
    }
    return false;
  }

  private publish(
    update: Partial<Omit<ProgressiveHistorySnapshot<T>, "revision">>,
  ): void {
    this.snapshotValue = {
      ...this.snapshotValue,
      ...update,
      coverageByStream: new Map(this.coverageByStream),
      revision: this.snapshotValue.revision + 1,
      unavailableByStream: new Map(this.unavailableByStream),
    };
    for (const listener of this.listeners) listener();
  }
}

function boundedResultMadeProgress(result: BudgetedReadResult): boolean {
  if (result.batches.length > 0 || result.usage.chunksOpened > 0) return true;
  for (const ranges of result.coverageByStream.values()) {
    if (ranges.length > 0) return true;
  }
  for (const ranges of result.unavailableByStream?.values() ?? []) {
    if (ranges.length > 0) return true;
  }
  return false;
}

/** Lazily enumerates fallback tiles so even pathological manifests are O(1). */
class GenericTileCursor<T> {
  private currentStreamIndex = 0;
  private currentWindow: TimeWindow | undefined;
  private leftIndex: bigint;
  private rightIndex: bigint;
  private readonly streams: readonly string[];
  private readonly windowCount: bigint;

  constructor(private readonly config: ProgressiveHistoryJobConfig<T>) {
    if (config.fallback.tileDurationNs <= 0n) {
      throw new Error("progressive history tile duration must be positive");
    }
    this.streams =
      config.traversal === "center-out"
        ? [...config.streams].sort((left, right) => left.localeCompare(right))
        : config.streams;
    const span = config.window.endNs - config.window.startNs + 1n;
    this.windowCount =
      span <= 0n
        ? 0n
        : (span + config.fallback.tileDurationNs - 1n) /
          config.fallback.tileDurationNs;
    if (config.traversal === "chronological") {
      this.leftIndex = 0n;
      this.rightIndex = this.windowCount;
      return;
    }
    const preferredTimeNs =
      config.preferredTimeNs ??
      config.window.startNs +
        (config.window.endNs - config.window.startNs) / 2n;
    const clampedPreferred =
      preferredTimeNs < config.window.startNs
        ? config.window.startNs
        : preferredTimeNs > config.window.endNs
          ? config.window.endNs
          : preferredTimeNs;
    const pivot =
      (clampedPreferred - config.window.startNs) /
      config.fallback.tileDurationNs;
    this.leftIndex = pivot;
    this.rightIndex = pivot + 1n;
  }

  peek(): GenericTile | undefined {
    if (this.streams.length === 0) return undefined;
    if (!this.currentWindow) this.currentWindow = this.nextWindow();
    const stream = this.streams[this.currentStreamIndex];
    return this.currentWindow && stream
      ? { stream, window: this.currentWindow }
      : undefined;
  }

  advance(): void {
    if (!this.currentWindow) return;
    this.currentStreamIndex += 1;
    if (this.currentStreamIndex < this.streams.length) return;
    this.currentStreamIndex = 0;
    this.currentWindow = undefined;
  }

  private nextWindow(): TimeWindow | undefined {
    if (this.config.traversal === "chronological") {
      if (this.leftIndex >= this.windowCount) return undefined;
      return this.windowAt(this.leftIndex++);
    }
    const left =
      this.leftIndex >= 0n ? this.windowAt(this.leftIndex) : undefined;
    const right =
      this.rightIndex < this.windowCount
        ? this.windowAt(this.rightIndex)
        : undefined;
    if (!left && !right) return undefined;
    if (!right) {
      this.leftIndex -= 1n;
      return left;
    }
    if (!left) {
      this.rightIndex += 1n;
      return right;
    }
    const preferredTimeNs =
      this.config.preferredTimeNs ??
      this.config.window.startNs +
        (this.config.window.endNs - this.config.window.startNs) / 2n;
    const leftDistance = distanceToWindow(left, preferredTimeNs);
    const rightDistance = distanceToWindow(right, preferredTimeNs);
    if (leftDistance <= rightDistance) {
      this.leftIndex -= 1n;
      return left;
    }
    this.rightIndex += 1n;
    return right;
  }

  private windowAt(index: bigint): TimeWindow | undefined {
    if (index < 0n || index >= this.windowCount) return undefined;
    const startNs =
      this.config.window.startNs + index * this.config.fallback.tileDurationNs;
    const candidateEndNs = startNs + this.config.fallback.tileDurationNs - 1n;
    return {
      endNs:
        candidateEndNs < this.config.window.endNs
          ? candidateEndNs
          : this.config.window.endNs,
      startNs,
    };
  }
}

function encodeIdentityParts(
  parts: readonly (bigint | number | string)[],
): string {
  return parts
    .map((part) => String(part))
    .map((part) => `${part.length}:${part}`)
    .join("");
}

function distanceToWindow(window: TimeWindow, timeNs: bigint): bigint {
  if (timeNs < window.startNs) return window.startNs - timeNs;
  if (timeNs > window.endNs) return timeNs - window.endNs;
  return 0n;
}
