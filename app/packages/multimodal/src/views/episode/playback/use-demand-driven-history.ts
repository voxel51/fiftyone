import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";

import { markEpisodeLatencyEvent } from "../../../observability/episode-latency";
import {
  startBulkStreamLifecycle,
  type BulkStreamControl,
} from "./bulk-stream-lifecycle";

/** Completed histories remain warm briefly without surviving a source swap. */
export const FULL_HISTORY_RETENTION_MS = 60_000;

/** Stream-scoped commit and cancellation controls supplied to a history read. */
export interface DemandDrivenHistoryLoader<T> {
  readonly commit: (value: T) => void;
  readonly control: BulkStreamControl;
  readonly stream: string;
}

interface DemandDrivenHistoryState<T> {
  readonly readIdentity: unknown;
  readonly sourceKey: string | null;
  readonly values: ReadonlyMap<string, T>;
}

const EMPTY_VALUES: ReadonlyMap<string, never> = new Map<string, never>();

/**
 * Reconciles a changing stream-demand union against source-scoped bulk reads.
 *
 * Incomplete reads are cancelled as soon as demand reaches zero. Completed
 * values survive for a short TTL, so closing and promptly reopening a tile does
 * not rescan the recording. A source/session change cancels and releases all
 * work immediately.
 */
export function useDemandDrivenHistory<T>({
  enabled = true,
  initialDelayMs,
  isRetainable,
  loadStream,
  readIdentity,
  retentionMs = FULL_HISTORY_RETENTION_MS,
  retryDelayMs,
  shouldStandDown,
  sourceKey,
  streams,
}: {
  readonly enabled?: boolean;
  readonly initialDelayMs: number;
  readonly isRetainable: (value: T) => boolean;
  readonly loadStream: (loader: DemandDrivenHistoryLoader<T>) => Promise<void>;
  /** The session/reader identity whose results must not cross into another read. */
  readonly readIdentity: unknown;
  readonly retentionMs?: number;
  readonly retryDelayMs: number;
  readonly shouldStandDown: () => boolean;
  readonly sourceKey: string | null;
  readonly streams: readonly string[];
}): ReadonlyMap<string, T> {
  const streamsKey = [...new Set(streams)].sort().join("\0");
  const normalizedStreams = useMemo(
    () => (streamsKey ? streamsKey.split("\0") : []),
    [streamsKey],
  );
  const [state, setState] = useState<DemandDrivenHistoryState<T>>({
    readIdentity,
    sourceKey,
    values: EMPTY_VALUES,
  });
  const valuesRef = useRef(new Map<string, T>());
  const desiredStreamsRef = useRef(new Set<string>());
  const activeReadsRef = useRef(new Map<string, () => void>());
  const evictionTimersRef = useRef(
    new Map<string, ReturnType<typeof setTimeout>>(),
  );
  const generationRef = useRef(0);
  const loadStreamRef = useRef(loadStream);
  const isRetainableRef = useRef(isRetainable);
  const shouldStandDownRef = useRef(shouldStandDown);
  loadStreamRef.current = loadStream;
  isRetainableRef.current = isRetainable;
  shouldStandDownRef.current = shouldStandDown;

  // This effect establishes the source/session cache boundary.
  useLayoutEffect(() => {
    const activeReads = activeReadsRef.current;
    const evictionTimers = evictionTimersRef.current;
    generationRef.current += 1;
    cancelAll(activeReads);
    clearAllTimers(evictionTimers);
    desiredStreamsRef.current = new Set();
    valuesRef.current = new Map();
    setState((previous) =>
      previous.readIdentity === readIdentity &&
      previous.sourceKey === sourceKey &&
      previous.values.size === 0
        ? previous
        : { readIdentity, sourceKey, values: EMPTY_VALUES },
    );

    return () => {
      generationRef.current += 1;
      cancelAll(activeReads);
      clearAllTimers(evictionTimers);
      desiredStreamsRef.current = new Set();
      valuesRef.current = new Map();
    };
  }, [readIdentity, sourceKey]);

  // This effect incrementally starts, cancels, reuses, and expires per-stream
  // histories without resetting unaffected sibling streams.
  useEffect(() => {
    const canRead = enabled && Boolean(sourceKey) && Boolean(readIdentity);
    const desiredStreams = new Set(canRead ? normalizedStreams : []);
    desiredStreamsRef.current = desiredStreams;
    const generation = generationRef.current;
    let changed = false;

    for (const [stream, cancel] of activeReadsRef.current) {
      if (desiredStreams.has(stream)) continue;
      cancel();
      activeReadsRef.current.delete(stream);
      const value = valuesRef.current.get(stream);
      if (value !== undefined && isRetainableRef.current(value)) {
        scheduleEviction({
          evictionTimers: evictionTimersRef.current,
          generation,
          generationRef,
          onEvict: () => {
            if (desiredStreamsRef.current.has(stream)) return;
            if (valuesRef.current.delete(stream)) publish();
          },
          retentionMs,
          stream,
        });
      } else if (valuesRef.current.delete(stream)) {
        changed = true;
      }
    }

    for (const [stream, value] of valuesRef.current) {
      if (
        desiredStreams.has(stream) ||
        evictionTimersRef.current.has(stream) ||
        !isRetainableRef.current(value)
      ) {
        continue;
      }
      scheduleEviction({
        evictionTimers: evictionTimersRef.current,
        generation,
        generationRef,
        onEvict: () => {
          if (desiredStreamsRef.current.has(stream)) return;
          if (valuesRef.current.delete(stream)) publish();
        },
        retentionMs,
        stream,
      });
    }

    for (const stream of desiredStreams) {
      const evictionTimer = evictionTimersRef.current.get(stream);
      if (evictionTimer !== undefined) {
        clearTimeout(evictionTimer);
        evictionTimersRef.current.delete(stream);
      }
      const value = valuesRef.current.get(stream);
      if (value !== undefined && isRetainableRef.current(value)) continue;
      if (activeReadsRef.current.has(stream)) continue;
      if (value !== undefined) {
        valuesRef.current.delete(stream);
        changed = true;
      }

      const cancel = startBulkStreamLifecycle({
        initialDelayMs,
        retryDelayMs,
        shouldStandDown: () => shouldStandDownRef.current(),
        streams: [stream],
        runStream: async (_, control) => {
          await loadStreamRef.current({
            commit: (nextValue) => {
              if (
                generationRef.current !== generation ||
                control.isCancelled() ||
                !desiredStreamsRef.current.has(stream)
              ) {
                return;
              }
              valuesRef.current.set(stream, nextValue);
              publish();
            },
            control,
            stream,
          });
        },
      });
      activeReadsRef.current.set(stream, cancel);
    }

    if (changed) publish();

    function publish(): void {
      if (generationRef.current !== generation) return;
      setState({
        readIdentity,
        sourceKey,
        values: new Map(valuesRef.current),
      });
    }
  }, [
    enabled,
    initialDelayMs,
    normalizedStreams,
    readIdentity,
    retentionMs,
    retryDelayMs,
    sourceKey,
  ]);

  if (state.sourceKey !== sourceKey || state.readIdentity !== readIdentity) {
    return EMPTY_VALUES;
  }
  return state.values;
}

function cancelAll(activeReads: Map<string, () => void>): void {
  for (const cancel of activeReads.values()) cancel();
  activeReads.clear();
}

function clearAllTimers(
  evictionTimers: Map<string, ReturnType<typeof setTimeout>>,
): void {
  for (const timer of evictionTimers.values()) clearTimeout(timer);
  evictionTimers.clear();
}

function scheduleEviction({
  evictionTimers,
  generation,
  generationRef,
  onEvict,
  retentionMs,
  stream,
}: {
  readonly evictionTimers: Map<string, ReturnType<typeof setTimeout>>;
  readonly generation: number;
  readonly generationRef: MutableRefObject<number>;
  readonly onEvict: () => void;
  readonly retentionMs: number;
  readonly stream: string;
}): void {
  const existing = evictionTimers.get(stream);
  if (existing !== undefined) clearTimeout(existing);
  const timer = setTimeout(() => {
    evictionTimers.delete(stream);
    if (generationRef.current === generation) onEvict();
  }, retentionMs);
  evictionTimers.set(stream, timer);
}
