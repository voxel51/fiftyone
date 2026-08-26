import { useEffect, useMemo, useState, type ReactNode } from "react";

import { VideoPlaybackManager } from "../../../video/playback-manager";
import { VideoPlaybackManagerProvider } from "../../../video/react";
import type {
  EncodedVideoAccessUnit,
  VideoAccessUnitReader,
} from "../../../video/types";
import { isSharedEncodedVideoVisualization } from "../../../video/types";
import { VISUALIZATION_KIND } from "../../../visualization";
import { useDataStream } from "./data-stream-context";

/** Binds the source manager to the current bounded episode read port. */
export function SourceVideoPlaybackProvider({
  children,
  sourceKey,
}: {
  readonly children: ReactNode;
  readonly sourceKey: string | null;
}) {
  const dataStream = useDataStream();
  const [managerBinding, setManagerBinding] = useState<{
    readonly manager: VideoPlaybackManager;
    readonly sourceKey: string;
  } | null>(null);
  const manager =
    managerBinding?.sourceKey === sourceKey ? managerBinding.manager : null;
  const reader = useMemo<VideoAccessUnitReader | null>(() => {
    const readStreamFrames = dataStream?.readStreamFrames;
    const timelineStartTimeNs =
      dataStream?.getTimelineIndex()?.startTimeNs ?? null;
    if (!readStreamFrames) return null;
    return {
      timelineStartTimeNs,
      read: async ({ budget, endTimeNs, signal, startTimeNs, stream }) => {
        const result = await readStreamFrames({
          budget,
          endTimeNs,
          signal,
          startTimeNs,
          stream,
        });
        const units: EncodedVideoAccessUnit[] = [];
        for (const decoded of result.frames) {
          const visualization = decoded.output.visualization;
          if (
            visualization?.kind !== VISUALIZATION_KIND.ENCODED_VIDEO ||
            !isSharedEncodedVideoVisualization(visualization)
          ) {
            continue;
          }
          units.push({
            frame: visualization,
            timeNs: decoded.timestampNs,
          });
        }
        return {
          complete: result.stopReason === "complete",
          stopReason: result.stopReason,
          units,
        };
      },
    };
  }, [dataStream]);

  useEffect(() => {
    if (!sourceKey) {
      setManagerBinding(null);
      return undefined;
    }
    const owned = new VideoPlaybackManager(sourceKey);
    const binding = { manager: owned, sourceKey };
    setManagerBinding(binding);
    return () => {
      owned.close();
      setManagerBinding((current) => (current === binding ? null : current));
    };
  }, [sourceKey]);

  useEffect(() => {
    manager?.setReader(reader);
  }, [manager, reader]);

  return (
    <VideoPlaybackManagerProvider manager={manager}>
      {children}
    </VideoPlaybackManagerProvider>
  );
}
