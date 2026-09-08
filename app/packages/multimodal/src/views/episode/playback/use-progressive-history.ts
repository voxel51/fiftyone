import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";

import type { EpisodeSession, SourceReadBudgetAccount } from "../../../ports";
import {
  getProgressiveHistoryJob,
  progressiveHistoryConfigIdentity,
  type ProgressiveHistoryJobConfig,
  type ProgressiveHistorySnapshot,
} from "../../../runtime/progressive-history";

/** Subscribes a view bridge to one session-retained progressive history job. */
export function useProgressiveHistory<T>({
  account,
  config,
  enabled = true,
  initialDelayMs = 0,
  retryDelayMs,
  session,
  shouldStandDown,
}: {
  readonly account?: SourceReadBudgetAccount | null;
  readonly config: ProgressiveHistoryJobConfig<T>;
  readonly enabled?: boolean;
  readonly initialDelayMs?: number;
  readonly retryDelayMs: number;
  readonly session: EpisodeSession | null;
  readonly shouldStandDown: () => boolean;
}): ProgressiveHistorySnapshot<T> {
  const standDownRef = useRef(shouldStandDown);
  standDownRef.current = shouldStandDown;
  const configIdentity = progressiveHistoryConfigIdentity(config);
  const job = useMemo(
    () => (session ? getProgressiveHistoryJob(session, account, config) : null),
    // The identity includes every read setting; config objects may be rebuilt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [account, configIdentity, session],
  );
  const empty = useMemo<ProgressiveHistorySnapshot<T>>(
    () => ({
      coverageByStream: new Map(),
      itemCount: 0,
      revision: 0,
      status: "idle",
      truncated: false,
      unavailableByStream: new Map(),
      value: config.accumulator.initialValue,
    }),
    // The initial accumulator belongs to the complete retained-job identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [configIdentity],
  );
  const subscribe = useCallback(
    (listener: () => void) => (job ? job.subscribe(listener) : () => undefined),
    [job],
  );
  const getSnapshot = useCallback(
    () => (job ? job.snapshot() : empty),
    [empty, job],
  );
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    if (!job || !enabled) return undefined;
    let release: (() => void) | undefined;
    const acquire = () => {
      release = job.acquire({
        retryDelayMs,
        shouldStandDown: () => standDownRef.current(),
      });
    };
    if (initialDelayMs <= 0) {
      acquire();
      return () => release?.();
    }
    const timer = setTimeout(acquire, initialDelayMs);
    return () => {
      clearTimeout(timer);
      release?.();
    };
  }, [enabled, initialDelayMs, job, retryDelayMs]);

  return snapshot;
}

/** Subscribes one consumer to a changing set of stable retained range jobs. */
export function useProgressiveHistories<T>({
  account,
  configs,
  enabled = true,
  retryDelayMs,
  session,
  shouldStandDown,
}: {
  readonly account?: SourceReadBudgetAccount | null;
  readonly configs: readonly ProgressiveHistoryJobConfig<T>[];
  readonly enabled?: boolean;
  readonly retryDelayMs: number;
  readonly session: EpisodeSession | null;
  readonly shouldStandDown: () => boolean;
}): readonly ProgressiveHistorySnapshot<T>[] {
  const standDownRef = useRef(shouldStandDown);
  standDownRef.current = shouldStandDown;
  const configsKey = configs
    .map(progressiveHistoryConfigIdentity)
    // Center-out priority may reorder the same demanded set. Keep the active
    // subscriptions until an identity enters or leaves the set.
    .sort()
    .map((identity) => `${identity.length}:${identity}`)
    .join("");
  const jobs = useMemo(
    () =>
      session
        ? configs.map((config) =>
            getProgressiveHistoryJob(session, account, config),
          )
        : [],
    // Every read-affecting config field participates in the hub identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [account, configsKey, session],
  );
  const subscribe = useCallback(
    (notify: () => void) => {
      const unsubscribes = jobs.map((job) => job.subscribe(notify));
      return () => {
        for (const unsubscribe of unsubscribes) unsubscribe();
      };
    },
    [jobs],
  );
  const snapshotsRef = useRef<{
    readonly jobs: readonly (typeof jobs)[number][];
    readonly snapshots: readonly ProgressiveHistorySnapshot<T>[];
  }>({ jobs: [], snapshots: [] });
  const getSnapshots = useCallback(() => {
    const snapshots = jobs.map((job) => job.snapshot());
    const previous = snapshotsRef.current;
    if (
      previous.jobs.length === jobs.length &&
      previous.jobs.every((job, index) => job === jobs[index]) &&
      previous.snapshots.every(
        (snapshot, index) => snapshot === snapshots[index],
      )
    ) {
      return previous.snapshots;
    }
    snapshotsRef.current = { jobs, snapshots };
    return snapshots;
  }, [jobs]);
  const snapshots = useSyncExternalStore(subscribe, getSnapshots, getSnapshots);
  useEffect(() => {
    if (!enabled) return undefined;
    const releases = jobs.map((job) =>
      job.acquire({
        retryDelayMs,
        shouldStandDown: () => standDownRef.current(),
      }),
    );
    return () => {
      for (const release of releases) release();
    };
  }, [enabled, jobs, retryDelayMs]);
  return snapshots;
}
