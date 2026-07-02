import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
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
  /**
   * Per-event color override. When set, the event's bar / marker paints in
   * this color instead of the track color — used by value-segmented sub-tracks
   * to color each segment by its value. Falls back to the track color.
   */
  color?: string;
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
  /**
   * Id of the parent track when this row is a sub-row (e.g. a dynamic-attribute
   * timeline nested under its instance track). Sub-rows are not independently
   * pinnable — they follow their parent's pin state so a parent + its children
   * always render contiguously in the same bucket. Omit for top-level rows.
   */
  parentId?: string;
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
  /**
   * Tracks to broadcast. Reactive; callers should provide a stable reference
   * so a new identity is a signal that the track list changed.
   */
  tracks?: Track[];
  /**
   * Track ids that should start pinned to the timeline. Anything else
   * sits in the "unpinned" pool, browsable but not rendered. **Mount-time
   * only** — captured into local state on the first render and never read
   * again. To mutate pin state after mount, call `togglePin` / `setPinned`
   * from `useTrackPinning()`.
   */
  initialPinnedIds?: string[];
  /**
   * Whether a track that first appears AFTER the initial hydration is
   * auto-pinned (e.g. a newly created tag). Defaults to `true` for the generic
   * timeline; the annotation surface opts out (`false`) so pinning is always an
   * explicit user action.
   */
  autoPinNewTracks?: boolean;
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
  tracks = [],
  initialPinnedIds = [],
  autoPinNewTracks = true,
  children,
}) => {
  const [pinnedIds, setPinnedSet] = useState<Set<string>>(
    () => new Set(initialPinnedIds),
  );

  // Auto-pin tracks added one-at-a-time after the initial load (e.g. a
  // newly created temporal tag). We distinguish "initial hydration" from
  // "incremental addition" using a ref: the first time tracks
  // becomes non-empty we mark all IDs as seen without pinning them (they
  // are pre-existing tags the user hasn't explicitly pinned). Any ID that
  // appears after that initial hydration is a new creation and gets pinned.
<<<<<<< HEAD
  const hydratedRef = useRef(initialTracks.length > 0);
  const seenTrackIdsRef = useRef<Set<string>>(
    new Set(initialTracks.map((t) => t.id)),
  );
=======
  const hydratedRef = useRef(tracks.length > 0);
  const seenTrackIdsRef = useRef<Set<string>>(new Set(tracks.map((t) => t.id)));
>>>>>>> main
  useEffect(() => {
    // Opt-out: the surface drives all pinning explicitly, so a new track must
    // not pin itself.
    if (!autoPinNewTracks) return;

    if (!hydratedRef.current) {
      // Still waiting for the first non-empty batch — don't advance
      // hydratedRef yet or seenTrackIdsRef would stay empty and every
      // track in the real load would look "new" and get auto-pinned.
      if (tracks.length === 0) return;
      // First non-empty tracks — record all IDs as seen so they
      // are not treated as new creations, but do not pin them.
      hydratedRef.current = true;
      for (const t of tracks) seenTrackIdsRef.current.add(t.id);
      return;
    }
    const unseen = tracks
      .map((t) => t.id)
      .filter((id) => !seenTrackIdsRef.current.has(id));
    if (unseen.length === 0) return;
    for (const id of unseen) seenTrackIdsRef.current.add(id);
    setPinnedSet((prev) => {
      const next = new Set(prev);
      for (const id of unseen) next.add(id);
      return next;
    });
  }, [tracks, autoPinNewTracks]);

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
      tracks,
      pinnedIds,
      togglePin,
      setPinned,
    }),
<<<<<<< HEAD
    [initialTracks, pinnedIds, togglePin, setPinned],
=======
    [tracks, pinnedIds, togglePin, setPinned],
>>>>>>> main
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
      "useTrackContext (and friends) must be used inside <TrackProvider>",
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
    [tracks, pinnedIds],
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
