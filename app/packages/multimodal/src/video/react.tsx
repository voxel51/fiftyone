import {
  useCallback,
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import type { EncodedH264VideoVisualization } from "../ir";
import type {
  VideoPlaybackManager,
  VideoStreamLease,
} from "./playback-manager";
import type { VideoIntentPriority, VideoStreamSnapshot } from "./types";

const EMPTY_VIDEO_SNAPSHOT: VideoStreamSnapshot = {
  diagnostic: null,
  generation: 0,
  phase: "idle",
  presentation: null,
  presentedTimeNs: null,
  targetTimeNs: null,
};

const VideoPlaybackManagerContext = createContext<VideoPlaybackManager | null>(
  null,
);

export function VideoPlaybackManagerProvider({
  children,
  manager,
}: {
  readonly children: ReactNode;
  readonly manager: VideoPlaybackManager | null;
}) {
  return (
    <VideoPlaybackManagerContext.Provider value={manager}>
      {children}
    </VideoPlaybackManagerContext.Provider>
  );
}

export function useOptionalVideoPlaybackManager(): VideoPlaybackManager | null {
  return useContext(VideoPlaybackManagerContext);
}

/** Acquires one mounted consumer while every consumer shares engine state. */
export function useVideoStreamPresentation({
  enabled = true,
  frame,
  manager: explicitManager,
  priority = "visible",
  stream,
  targetTimeNs,
}: {
  readonly enabled?: boolean;
  readonly frame: EncodedH264VideoVisualization | null;
  readonly manager?: VideoPlaybackManager | null;
  readonly priority?: VideoIntentPriority;
  readonly stream: string;
  readonly targetTimeNs: bigint | null;
}): VideoStreamSnapshot {
  const contextManager = useOptionalVideoPlaybackManager();
  const manager = explicitManager ?? contextManager;
  const [leaseBinding, setLeaseBinding] = useState<{
    readonly lease: VideoStreamLease;
    readonly manager: VideoPlaybackManager;
    readonly stream: string;
  } | null>(null);
  const lease =
    enabled &&
    leaseBinding?.manager === manager &&
    leaseBinding.stream === stream
      ? leaseBinding.lease
      : null;

  useEffect(() => {
    if (!manager || manager.isClosed || !stream || !enabled) {
      setLeaseBinding(null);
      return undefined;
    }
    const acquired = manager.acquire(stream);
    const binding = { lease: acquired, manager, stream };
    setLeaseBinding(binding);
    return () => {
      setLeaseBinding((current) => (current === binding ? null : current));
      acquired.release();
    };
  }, [enabled, manager, stream]);

  const subscribe = useCallback(
    (listener: () => void) => lease?.subscribe(listener) ?? (() => undefined),
    [lease],
  );
  const getSnapshot = useCallback(
    () => lease?.getSnapshot() ?? EMPTY_VIDEO_SNAPSHOT,
    [lease],
  );
  const snapshot = useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => EMPTY_VIDEO_SNAPSHOT,
  );

  useEffect(() => {
    if (
      !enabled ||
      !frame ||
      targetTimeNs === null ||
      leaseBinding?.manager !== manager ||
      leaseBinding.stream !== stream
    ) {
      return;
    }
    leaseBinding.lease.request({ frame, priority, timeNs: targetTimeNs });
  }, [enabled, frame, leaseBinding, manager, priority, stream, targetTimeNs]);

  return snapshot;
}
