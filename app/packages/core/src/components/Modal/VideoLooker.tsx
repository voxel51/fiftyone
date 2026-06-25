import { useTheme } from "@fiftyone/components";
import type { VideoLooker } from "@fiftyone/looker";
import { getFrameNumber } from "@fiftyone/looker";
import {
  useCreateTimeline,
  useDefaultTimelineNameImperative,
  useTimeline,
} from "@fiftyone/playback";
import * as fos from "@fiftyone/state";
import React, { useEffect, useMemo, useState } from "react";
import { useInitializeVideoSubscriptions } from "./hooks";
import useLooker from "./use-looker";
import { useVideoModalSelectiveRendering } from "./use-modal-selective-rendering";

interface VideoLookerReactProps {
  sample: fos.ModalSample;
  showControls?: boolean;
}

export const VideoLookerReact = (props: VideoLookerReactProps) => {
  const theme = useTheme();
  const { id, looker, sample } = useLooker<VideoLooker>(props);
  const { subscribeToVideoStateChanges } = useInitializeVideoSubscriptions();
  useEffect(() => {
    if (looker) {
      subscribeToVideoStateChanges();
    }
  }, [looker, subscribeToVideoStateChanges]);
  const [totalFrames, setTotalFrames] = useState<number>();
  const frameRate = useMemo(() => {
    return (
      sample.frameRate ??
      (sample.sample as { metadata?: { frame_rate?: number } } | undefined)
        ?.metadata?.frame_rate
    );
  }, [sample]);
  // `video.duration` under-reports for range-served / non-faststart mp4s, truncating
  // the timeline, so prefer the stored count.
  const totalFrameCount = useMemo(() => {
    const count = (
      sample.sample as { metadata?: { total_frame_count?: number } } | undefined
    )?.metadata?.total_frame_count;
    return typeof count === "number" && count > 0 ? count : null;
  }, [sample]);

  useVideoModalSelectiveRendering(id, looker);

  useEffect(() => {
    if (totalFrameCount != null) {
      setTotalFrames(totalFrameCount);
      return;
    }

    // fall back to the (less reliable) media duration only when metadata is absent
    const load = () => {
      const duration = looker.getVideo().duration;
      setTotalFrames(getFrameNumber(duration, duration, frameRate));
      looker.removeEventListener("load", load);
    };
    looker.addEventListener("load", load);
    return () => looker.removeEventListener("load", load);
  }, [totalFrameCount, frameRate, looker]);

  return (
    <>
      <div
        id={id}
        data-cy="modal-looker-container"
        style={{
          width: "100%",
          height: "100%",
          background: theme.background.level2,
          position: "relative",
        }}
      />
      {totalFrames !== undefined && (
        <TimelineController looker={looker} totalFrames={totalFrames} />
      )}
    </>
  );
};

const TimelineController = React.memo(
  ({ looker, totalFrames }: { looker: VideoLooker; totalFrames: number }) => {
    const { getName } = useDefaultTimelineNameImperative();
    const timelineName = React.useMemo(() => getName(), [getName]);

    useCreateTimeline({
      name: timelineName,
      config: totalFrames
        ? {
            totalFrames,
            loop: true,
          }
        : undefined,
      optOutOfAnimation: true,
    });

    const { pause, play } = useTimeline(timelineName);

    fos.useEventHandler(looker, "pause", pause);
    fos.useEventHandler(looker, "play", play);

    return null;
  }
);
