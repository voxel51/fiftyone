// ---------------------------------------------------------------------------
// usePlaybackStream
//
// Convenience hook for components that act as data streams. Handles the
// register/unregister lifecycle and wires up seek notifications via Jotai.
//
// Usage:
//
//   const DEFAULT_LOOKAHEAD = 3; // seconds
//
//   function CameraStream() {
//     const cacheRef = useRef<Set<number>>(new Set());
//     const pendingRef = useRef<Set<number>>(new Set());
//
//     // Subscribe to seek events (debounced during scrub) to flush cache.
//     const seekEvent = useAtomValue(seekEventAtom);
//     useEffect(() => {
//       if (!seekEvent) return;
//       cacheRef.current.clear();
//       pendingRef.current.clear();
//     }, [seekEvent]);
//
//     // Subscribe to playhead to grow the lookahead buffer during playback.
//     const playhead = useAtomValue(playheadAtom);
//     useEffect(() => {
//       prefetchUpTo(playhead + DEFAULT_LOOKAHEAD);
//     }, [currentTime]);
//
//     usePlaybackStream({
//       id: 'camera',
//       blocking: true,
//       lookaheadSeconds: DEFAULT_LOOKAHEAD,
//       bufferState: (time) => {
//         const frame = Math.floor(time * fps);
//         if (cacheRef.current.has(frame)) return "ready";
//         if (pendingRef.current.has(frame)) return "loading";
//         return "missing";
//       },
//       prefetch: ([start, end]) => {
//         startBufferingRange(start, end);
//       },
//       bufferedRanges: () => computeContiguousRanges(cacheRef.current),
//     });
//
//     return null;
//   }
//
// IMPORTANT: bufferState is called from the RAF loop at 60fps. It must not
// allocate or trigger React state updates. Use refs for cache storage.
//
// Changing `blocking` mid-playback is valid (e.g. a stream demotes itself
// to non-blocking after initial load) — registerStream replaces the Map
// entry in-place so the RAF loop picks up the change on the next tick.
// ---------------------------------------------------------------------------

import { useEffect } from "react";
import { usePlayback } from "./PlaybackProvider";
import type { PlaybackStream } from "./playback-types";

export function usePlaybackStream(stream: PlaybackStream) {
  const { registerStream } = usePlayback();

  useEffect(() => {
    return registerStream(stream);
    // Re-register when id or blocking changes. bufferState/prefetch changing
    // within the same id is fine — the Map entry is replaced immediately, so
    // the RAF loop always calls the latest closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registerStream, stream.id, stream.blocking]);
}
