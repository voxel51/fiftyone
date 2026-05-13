import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

/**
 * A single time-stamped event inside a {@link Track}. When `endSec` is
 * provided the event is an interval (e.g. "cat was in frame from 1.2s
 * to 2.8s"); without it the event is a point ("hard deceleration at
 * 3.4s").
 */
export interface TrackEvent {
  startSec: number;
  /** Inclusive end time. Omit for point events. */
  endSec?: number;
  /** Optional human-readable label, e.g. for hover / inspection. */
  label?: string;
  /** Free-form payload — anything the source produced about this event. */
  data?: unknown;
}

/**
 * A "track" is a sequence of semantically meaningful events extracted
 * from the underlying data — e.g. "Cat detected", "Hard deceleration",
 * "Collision". Tracks are produced by ingestion-time pipelines from
 * topics in the recording; the UI here just consumes the result.
 *
 * Tracks are intentionally decoupled from streams: one stream (the
 * front camera) might produce many tracks (cat detected, person
 * detected, glare), and one track (collision) might fuse data from
 * several streams.
 */
export interface Track {
  id: string;
  /** Short label rendered in the timeline row and the tracks list. */
  label: string;
  /** Long-form description of what query / pipeline produced this. */
  description?: string;
  /** Display color for the row + event chips. */
  color: string;
  /** Events on this track, in start-time order. */
  events: TrackEvent[];
}

export interface TrackContextValue {
  /** Every track that's been registered for the current session. */
  tracks: Track[];
  /** Set of track ids currently pinned to the timeline. */
  pinnedIds: ReadonlySet<string>;
  /** Toggle a single track's pin state. */
  togglePin: (id: string) => void;
  /** Imperative set for a single track. */
  setPinned: (id: string, pinned: boolean) => void;
}

const TrackContext = createContext<TrackContextValue | null>(null);

export interface TrackProviderProps {
  /** Tracks to broadcast. Treated as mount-time config (no churn). */
  initialTracks?: Track[];
  /**
   * Track ids that should start pinned to the timeline. Anything else
   * sits in the "unpinned" pool, browsable but not rendered.
   */
  initialPinnedIds?: string[];
  children: React.ReactNode;
}

/**
 * Broadcasts the available tracks for the current session. Stories /
 * apps wrap their tree in this provider; consumers read via:
 *
 *   - `useTracks()` — every registered track
 *   - `usePinnedTracks()` — just the ones currently pinned (the
 *     timeline filters by this)
 *   - `useTrackPinning()` — `{ pinnedIds, togglePin, setPinned }` for
 *     building pin UI
 *
 * Today the tracks are mocked. The eventual data path: a per-MCAP
 * manifest declares what to distill from each topic, ingestion runs
 * those queries, and the resulting tracks are loaded into this
 * provider when the user opens that recording.
 */
export const TrackProvider: React.FC<TrackProviderProps> = ({
  initialTracks = [],
  initialPinnedIds = [],
  children,
}) => {
  // Tracks are mount-time config — no setter exposed. Capture in a ref so
  // a parent passing a fresh `initialTracks` array on every render doesn't
  // bust the context's memoization.
  const tracksRef = useRef(initialTracks);
  const [pinnedIds, setPinnedSet] = useState<Set<string>>(
    () => new Set(initialPinnedIds)
  );

  const togglePin = useCallback((id: string) => {
    setPinnedSet((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const setPinned = useCallback((id: string, pinned: boolean) => {
    setPinnedSet((prev) => {
      // No-op when the requested state already matches — saves a context
      // re-render that would otherwise propagate to every track row.
      if (prev.has(id) === pinned) return prev;
      const next = new Set(prev);
      if (pinned) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const value = useMemo<TrackContextValue>(
    () => ({
      tracks: tracksRef.current,
      pinnedIds,
      togglePin,
      setPinned,
    }),
    [pinnedIds, togglePin, setPinned]
  );

  return (
    <TrackContext.Provider value={value}>{children}</TrackContext.Provider>
  );
};

/** Pull the surrounding TrackProvider's context. Throws when missing. */
export function useTrackContext(): TrackContextValue {
  const ctx = useContext(TrackContext);
  if (!ctx) {
    throw new Error(
      "useTrackContext (and friends) must be used inside <TrackProvider>"
    );
  }
  return ctx;
}

/** Every track broadcast by the surrounding provider. */
export function useTracks(): Track[] {
  return useTrackContext().tracks;
}

/** Just the tracks the user has pinned to the timeline. */
export function usePinnedTracks(): Track[] {
  const { tracks, pinnedIds } = useTrackContext();
  return useMemo(
    () => tracks.filter((t) => pinnedIds.has(t.id)),
    [tracks, pinnedIds]
  );
}

/** The pin state + setters; use for building pin-toggle UI. */
export function useTrackPinning(): Pick<
  TrackContextValue,
  "pinnedIds" | "togglePin" | "setPinned"
> {
  const { pinnedIds, togglePin, setPinned } = useTrackContext();
  return { pinnedIds, togglePin, setPinned };
}
