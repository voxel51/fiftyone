import { useCallback, useSyncExternalStore } from "react";
import { createStreamHandle } from "./createStreamHandle";
import type { VideoFrameLabelsStream } from "./VideoFrameLabelsStream";

const { useStream, usePublishStream } =
  createStreamHandle<VideoFrameLabelsStream>();

/**
 * Active frame-labels stream; publication goes through
 * {@link usePublishFrameLabelsStream} so external code can't write arbitrary
 * values.
 *
 * `null` while the stream's params (sampleId, duration, etc.) aren't all
 * available yet — consumers should treat that as "no data available; render
 * placeholder."
 */
export const useFrameLabelsStream = useStream;

/**
 * Publishes `stream` as the active frame-labels stream for the lifetime of
 * the calling component, clearing on unmount. Intended for the labels
 * registrar; nothing else should be publishing.
 */
export const usePublishFrameLabelsStream = usePublishStream;

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

  const getSnapshot = useCallback(
    () => stream?.getEditVersion() ?? 0,
    [stream]
  );

  return useSyncExternalStore(subscribe, getSnapshot);
}
