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
import useLooker from "./use-looker";
import { useVideoModalSelectiveRendering } from "./use-modal-selective-rendering";

interface VideoLookerReactProps {
  sample: fos.ModalSample;
}

export const VideoLookerReact = (props: VideoLookerReactProps) => {
  const theme = useTheme();
  const { id, looker, sample } = useLooker<VideoLooker>(props);
  const [totalFrames, setTotalFrames] = useState<number>();
  const frameRate = useMemo(() => {
    return sample.frameRate;
  }, [sample]);

  useVideoModalSelectiveRendering(id, looker);

  useEffect(() => {
    const load = () => {
      const duration = looker.getVideo().duration;
      setTotalFrames(getFrameNumber(duration, duration, frameRate));
      looker.removeEventListener("load", load);
    };
    looker.addEventListener("load", load);
  }, [frameRate, looker]);

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
