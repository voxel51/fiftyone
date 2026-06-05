import { atom, type PrimitiveAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import type { VideoFrameLabelsStream } from "./VideoFrameLabelsStream";

/**
 * Active frame-labels stream; publication goes through
 * {@link usePublishFrameLabelsStream} so external code can't write arbitrary
 * values.
 *
 * `null` while the stream's params (sampleId, duration, etc.) aren't all
 * available yet — consumers should treat that as "no data available; render
 * placeholder."
 */
const frameLabelsStreamAtom = atom<VideoFrameLabelsStream | null>(
  null
) as PrimitiveAtom<VideoFrameLabelsStream | null>;

export function useFrameLabelsStream(): VideoFrameLabelsStream | null {
  return useAtomValue(frameLabelsStreamAtom);
}

/**
 * Publishes `stream` as the active frame-labels stream for the lifetime of
 * the calling component, clearing on unmount. Intended for the labels
 * registrar; nothing else should be publishing.
 */
export function usePublishFrameLabelsStream(
  stream: VideoFrameLabelsStream | null
): void {
  const setStream = useSetAtom(frameLabelsStreamAtom);

  useEffect(() => {
    setStream(stream);

    return () => setStream(null);
  }, [setStream, stream]);
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

  const getSnapshot = useCallback(
    () => stream?.getEditVersion() ?? 0,
    [stream]
  );

  return useSyncExternalStore(subscribe, getSnapshot);
}
