import { KnownContexts, useKeyBindings } from "@fiftyone/commands";
import {
  getPlayhead,
  useDuration,
  usePlayback,
  usePlaybackStore,
} from "@fiftyone/playback";
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
 * A clip's support: the 1-indexed, inclusive `[first, last]` frame range of
 * the parent video that the clip sample covers. Present on every sample of a
 * `to_clips()` view.
 */
export type ClipSupport = readonly [number, number];

/**
 * The seconds the support spans on the playback timeline. Frame `n` occupies
 * `[(n - 1) / fps, n / fps)`, so the range runs from the first frame's start
 * to the last frame's END — the loop's upper bound is exclusive
 * (`rawNext >= loopEnd` wraps), and stopping at the last frame's start would
 * drop that frame from playback.
 */
export const supportToSeconds = (
  support: ClipSupport,
  frameRate: number,
): { start: number; end: number } => ({
  start: (support[0] - 1) / frameRate,
  end: support[1] / frameRate,
});

export interface ClipSupportValue {
  /** The clip's frame range, or `null` when the sample is not a clip. */
  support: ClipSupport | null;
  /**
   * Whether playback is confined to the support. Only meaningful when
   * `support` is set; always `false` otherwise.
   */
  locked: boolean;
  /** Flip the lock. A no-op when there is no support. */
  toggleLock: () => void;
}

const NO_SUPPORT: ClipSupportValue = {
  support: null,
  locked: false,
  toggleLock: () => undefined,
};

const ClipSupportContext = createContext<ClipSupportValue>(NO_SUPPORT);

/**
 * The clip support state of the enclosing {@link ClipSupportRange}. Outside
 * one — or for a sample that is not a clip — reports no support.
 */
export const useClipSupport = (): ClipSupportValue =>
  useContext(ClipSupportContext);

export interface ClipSupportRangeProps {
  support: ClipSupport | null;
  /**
   * The video's frame rate. Without one the support cannot be placed on the
   * seconds timeline, so the range is not applied.
   */
  frameRate: number | undefined;
  children: React.ReactNode;
}

/**
 * Confines the playback engine to a clip's support, the way the video looker
 * did for `to_clips()` samples.
 *
 * The engine's loop region is the primitive: while locked the loop AND the
 * view window are set to the support, so playback wraps within the clip, the
 * ruler shows only the clip's frames, and `LoopBounds` reads out its edges.
 * The playhead is seeded at the support's first frame once, when the video's
 * duration first lands — until then `setLoop` / `setView` clamp against a
 * zero duration and reject every range, so nothing can be applied at mount.
 *
 * While locked, user seeks and frame steps are confined to the support as
 * well (`setConfineToLoop`), so `.` / `,` and the ruler cannot leave the clip.
 *
 * Unlocking restores the full timeline. Re-locking moves a playhead that
 * wandered outside the support back to its first frame; one already inside
 * stays put.
 *
 * Owns the `l` key, the looker's "support lock" shortcut. Mount one per
 * sample (key on the sample id) so the lock state and the one-shot seed
 * reset when the modal moves to the next clip.
 */
export const ClipSupportRange: React.FC<ClipSupportRangeProps> = ({
  support,
  frameRate,
  children,
}) => {
  const { setLoop, setView, setConfineToLoop, seek } = usePlayback();
  const store = usePlaybackStore();
  const duration = useDuration();
  const [locked, setLocked] = useState(true);

  const range = useMemo(
    () =>
      support && frameRate && Number.isFinite(frameRate) && frameRate > 0
        ? supportToSeconds(support, frameRate)
        : null,
    [support, frameRate],
  );

  // The lock state the engine currently reflects. `null` until the first
  // application, which has to wait for a positive duration.
  const appliedRef = useRef<boolean | null>(null);

  useEffect(() => {
    if (!range || !(duration > 0)) return;
    const first = appliedRef.current === null;
    if (locked) {
      setLoop(range.start, range.end);
      setView(range.start, range.end);
      // Scrubbing and stepping stay inside the clip too, not just playback.
      setConfineToLoop(true);
      const playhead = getPlayhead(store);
      if (first || playhead < range.start || playhead >= range.end) {
        seek(range.start);
      }
    } else if (appliedRef.current !== false) {
      // Only on the transition: re-running on a duration refinement while
      // unlocked would throw away a zoom the user has since applied.
      setConfineToLoop(false);
      setLoop(0, duration);
      setView(0, duration);
    }
    appliedRef.current = locked;
  }, [
    range,
    duration,
    locked,
    setLoop,
    setView,
    setConfineToLoop,
    seek,
    store,
  ]);

  // The provider outlives this component when consecutive samples share a
  // frame rate (it is keyed on the mode, not the sample), so a clip must not
  // leave the next sample confined to its range.
  useEffect(() => () => setConfineToLoop(false), [setConfineToLoop]);

  const toggleLock = useCallback(() => {
    if (!range) return;
    setLocked((current) => !current);
  }, [range]);

  const hasRange = range !== null;
  useKeyBindings(
    KnownContexts.Modal,
    [
      {
        commandId: "video-explore-support-lock",
        sequence: "l",
        enablement: () => hasRange,
        handler: toggleLock,
        label: "Support lock",
        description: "Toggle the lock on the clip's support frames",
      },
    ],
    [hasRange, toggleLock],
  );

  const value = useMemo<ClipSupportValue>(
    () => (range && support ? { support, locked, toggleLock } : NO_SUPPORT),
    [range, support, locked, toggleLock],
  );

  return (
    <ClipSupportContext.Provider value={value}>
      {children}
    </ClipSupportContext.Provider>
  );
};
