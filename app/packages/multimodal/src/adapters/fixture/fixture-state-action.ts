import type { RawRecordIndexWindow } from "../../ir";
import {
  EpisodeExactCursorError,
  EpisodeReadCancelledError,
  type StateActionCapability,
  type StateActionFeatureSchema,
  type StateActionRow,
  type StateActionSchema,
} from "../../ports";
import { throwIfAborted } from "../../utils/cancellation";

const NS_PER_SECOND = 1_000_000_000;

/** One declared state/action feature with its per-row stored values. */
export interface StateActionScenarioFeature {
  readonly dtype: string;
  readonly names?: readonly string[] | null;
  /** Per-row raw values, nested exactly as stored; scalars allowed. */
  readonly rows: readonly unknown[];
  readonly shape: readonly number[];
}

/** Deterministic dataset description shared by state/action test harnesses. */
export interface StateActionScenario {
  readonly action?: StateActionScenarioFeature;
  /** Declared episode end in seconds; defaults to the last row timestamp. */
  readonly declaredEndSeconds?: number;
  /** Episode-declared task labels, independent of the tasks asset. */
  readonly episodeTasks?: readonly string[];
  /** Simulated slab-fill latency so abort and dedupe behavior is observable. */
  readonly fillLatencyMs?: number;
  readonly state?: StateActionScenarioFeature;
  /** Per-row task indexes; defaults to zero for every row. */
  readonly taskIndexes?: readonly number[];
  /** Tasks metadata mapping; undefined means the tasks asset is absent. */
  readonly taskLabelsByIndex?: Readonly<Record<number, string>>;
  readonly timestampsSeconds: readonly number[];
}

/** In-memory reference provider used by the capability contract tests. */
export interface FixtureStateActionProvider {
  readonly capability: StateActionCapability;
  readonly declaredEndNs: bigint;
  dispose(): void;
  /** Count of simulated physical data reads issued so far. */
  physicalReads(): number;
}

interface FilledRow {
  readonly action?: readonly unknown[];
  readonly featureErrors?: StateActionRow["featureErrors"];
  readonly state?: readonly unknown[];
  readonly taskIndex: number;
}

/**
 * Reference implementation of the state/action capability over an in-memory
 * scenario. It mirrors the production semantics — latest-row-at-or-before
 * time resolution, one deduplicated fill, index-only windows, typed cursor
 * rejection — without any real source format.
 */
export function createFixtureStateActionProvider(
  scenario: StateActionScenario,
): FixtureStateActionProvider {
  const timesNs = scenario.timestampsSeconds.map(secondsToNs);
  const rowCount = timesNs.length;
  const declaredEndNs =
    scenario.declaredEndSeconds !== undefined
      ? secondsToNs(scenario.declaredEndSeconds)
      : (timesNs.at(-1) ?? 0n);
  const schema: StateActionSchema = {
    ...(scenario.action
      ? { action: featureSchema("action", scenario.action) }
      : {}),
    rowCount,
    ...(scenario.state
      ? { state: featureSchema("observation.state", scenario.state) }
      : {}),
  };

  let disposed = false;
  let reads = 0;
  let fill: Promise<readonly FilledRow[]> | null = null;

  const ensureOpen = () => {
    if (disposed) throw new EpisodeReadCancelledError();
  };
  const ensureFill = () => {
    if (!fill) {
      const started = (async () => {
        reads += 1;
        if (scenario.fillLatencyMs) await delay(scenario.fillLatencyMs);
        ensureOpen();
        return buildFilledRows(scenario, rowCount);
      })();
      fill = started;
      void started.catch(() => {
        if (fill === started) fill = null;
      });
    }
    return fill;
  };
  const rowAt = async (
    offset: number,
    signal?: AbortSignal,
  ): Promise<StateActionRow> => {
    const filled = await waitForSharedFill(ensureFill(), signal);
    throwIfAborted(signal);
    ensureOpen();
    const row = filled[offset];
    return {
      ...(row.action ? { action: [...row.action] } : {}),
      cursor: `row:${offset}`,
      ...(row.featureErrors ? { featureErrors: row.featureErrors } : {}),
      frameIndex: offset,
      ...(row.state ? { state: [...row.state] } : {}),
      task: {
        index: row.taskIndex,
        ...(taskLabel(scenario, row.taskIndex) !== undefined
          ? { label: taskLabel(scenario, row.taskIndex) }
          : {}),
      },
      timestampNs: timesNs[offset],
    };
  };

  return {
    capability: {
      schema,
      async readAtCursor(request) {
        ensureOpen();
        throwIfAborted(request.signal);
        return rowAt(parseCursor(request.cursor, rowCount), request.signal);
      },
      async readAtTime(request) {
        ensureOpen();
        throwIfAborted(request.signal);
        if (request.timestampNs > declaredEndNs) return null;
        const offset = offsetAtOrBefore(timesNs, request.timestampNs);
        return offset === null ? null : rowAt(offset, request.signal);
      },
      async readIndexWindow(request) {
        ensureOpen();
        throwIfAborted(request.signal);
        const selected =
          request.anchorCursor !== undefined
            ? parseCursor(request.anchorCursor, rowCount)
            : (offsetAtOrBefore(timesNs, request.anchorTimestampNs) ?? 0);
        const start = Math.max(0, selected - Math.max(0, request.before));
        const end = Math.min(
          rowCount,
          selected + Math.max(0, request.after) + 1,
        );
        const window: RawRecordIndexWindow = {
          entries: timesNs.slice(start, end).map((timestampNs, index) => ({
            cursor: `row:${start + index}`,
            timestampNs,
          })),
          hasNext: end < rowCount,
          hasPrevious: start > 0,
          selectedCursor: `row:${selected}`,
        };
        return window;
      },
    },
    declaredEndNs,
    dispose() {
      disposed = true;
      fill = null;
    },
    physicalReads: () => reads,
  };
}

/** Flattens nested stored values in row-major source order. */
export function flattenStateActionValues(value: unknown): readonly unknown[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => flattenStateActionValues(entry));
  }
  return [value];
}

function buildFilledRows(
  scenario: StateActionScenario,
  rowCount: number,
): readonly FilledRow[] {
  return Array.from({ length: rowCount }, (_, offset) => {
    const state = scenario.state
      ? flattenStateActionValues(scenario.state.rows[offset])
      : undefined;
    const action = scenario.action
      ? flattenStateActionValues(scenario.action.rows[offset])
      : undefined;
    const stateError =
      scenario.state && state
        ? shapeMismatch("observation.state", scenario.state, state.length)
        : undefined;
    const actionError =
      scenario.action && action
        ? shapeMismatch("action", scenario.action, action.length)
        : undefined;
    return {
      ...(action ? { action } : {}),
      ...(stateError || actionError
        ? {
            featureErrors: {
              ...(actionError ? { action: actionError } : {}),
              ...(stateError ? { state: stateError } : {}),
            },
          }
        : {}),
      ...(state ? { state } : {}),
      taskIndex: scenario.taskIndexes?.[offset] ?? 0,
    };
  });
}

function shapeMismatch(
  featureName: string,
  feature: StateActionScenarioFeature,
  count: number,
): string | undefined {
  const expected = elementCount(feature.shape);
  return count === expected
    ? undefined
    : `'${featureName}' row has ${count} values but declares shape [${feature.shape.join(",")}]`;
}

function featureSchema(
  featureName: string,
  feature: StateActionScenarioFeature,
): StateActionFeatureSchema {
  return {
    dimensions: Array.from(
      { length: elementCount(feature.shape) },
      (_, index) => ({
        index,
        ...(feature.names?.[index] !== undefined
          ? { name: feature.names[index] }
          : {}),
      }),
    ),
    dtype: feature.dtype,
    featureName,
    shape: feature.shape,
  };
}

function elementCount(shape: readonly number[]): number {
  return Math.max(
    1,
    shape.reduce((product, value) => product * value, 1),
  );
}

function taskLabel(
  scenario: StateActionScenario,
  index: number,
): string | undefined {
  return (
    scenario.taskLabelsByIndex?.[index] ??
    (scenario.episodeTasks?.length === 1 ? scenario.episodeTasks[0] : undefined)
  );
}

function parseCursor(cursor: string, rowCount: number): number {
  const match = /^row:(\d+)$/.exec(cursor);
  const value = match ? Number(match[1]) : Number.NaN;
  if (!Number.isSafeInteger(value) || value < 0 || value >= rowCount) {
    throw new EpisodeExactCursorError(
      "Unknown state/action row cursor for this source",
    );
  }
  return value;
}

function offsetAtOrBefore(
  timesNs: readonly bigint[],
  timestampNs: bigint,
): number | null {
  if (!timesNs.length || timestampNs < timesNs[0]) return null;
  let low = 0;
  let high = timesNs.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (timesNs[middle] <= timestampNs) low = middle + 1;
    else high = middle;
  }
  return Math.max(0, low - 1);
}

function secondsToNs(seconds: number): bigint {
  return BigInt(Math.round(seconds * NS_PER_SECOND));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForSharedFill<T>(
  promise: Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  if (!signal) return promise;
  throwIfAborted(signal);
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      cleanup();
      try {
        throwIfAborted(signal);
      } catch (error) {
        reject(error);
      }
    };
    const cleanup = () => signal.removeEventListener("abort", onAbort);
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
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
