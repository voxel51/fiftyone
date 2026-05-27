import { createContext, useCallback, useContext, useSyncExternalStore } from "react";
import type { VideoFrameLabelsStream } from "./VideoFrameLabelsStream";

/**
 * Shares the active frame-labels stream from the registrar component
 * down to downstream consumers (e.g. the per-class track builder) so we
 * don't issue duplicate `/frames` fetches against the same sample.
 *
 * Value is `null` while the stream's params (sampleId, duration, etc.)
 * aren't all available yet — consumers should treat that as "no data
 * available; render placeholder."
 */
export const FrameLabelsContext = createContext<VideoFrameLabelsStream | null>(
  null
);

export function useFrameLabelsStream(): VideoFrameLabelsStream | null {
  return useContext(FrameLabelsContext);
}

/**
 * Reactive view of the active labels stream's edit version. Returns a
 * monotonically increasing counter that bumps on every cache mutation
 * (fetch landing, local insert / update / remove).
 *
 * Use as a `useEffect` / `useMemo` dependency when deriving cross-frame
 * state (e.g. timeline track rows from {@link buildPerInstanceTracks}).
 * Single-frame consumers should keep reading the published snapshot via
 * `useStream(LABELS_STREAM_ID)` instead.
 *
 * Returns `0` when no stream is mounted (e.g. synthetic-labels mode).
 */
export function useFrameLabelsEditVersion(): number {
  const stream = useFrameLabelsStream();
  const subscribe = useCallback(
    (notify: () => void) => stream?.subscribeToEdits(notify) ?? (() => {}),
    [stream]
  );
  const getSnapshot = useCallback(() => stream?.getEditVersion() ?? 0, [stream]);
  return useSyncExternalStore(subscribe, getSnapshot);
}
