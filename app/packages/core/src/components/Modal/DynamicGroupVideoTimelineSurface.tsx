/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { PlaybackProvider, type TimelineMode } from "@fiftyone/playback";
import * as fos from "@fiftyone/state";
import {
  FrameLabelsTracks,
  ImaVidLighterTile,
  RegisterFrameLabels,
  RegisterImaVidImage,
  RegisterVideoExploreLabels,
  useAnnotatePrerequisites,
  useTimelineMaxSize,
} from "@fiftyone/video-annotation";
import React, { useCallback, useMemo, useRef } from "react";
import { VideoExploreToolbar } from "./VideoExploreToolbar";
import { useVideoExploreKeybindings } from "./useVideoExploreKeybindings";
import styles from "./VideoTimelineSurface.module.css";

/** The readiness marker every sample surface publishes; see `VideoTimelineSurface`. */
const LOADED = "canvas-loaded";

export interface DynamicGroupVideoTimelineSurfaceProps {
  sample: fos.ModalSample;
}

/**
 * The Explore surface for an image dataset grouped into an ordered group and
 * viewed as a video: `VideoTimelineSurface` with the `<video>` replaced by the
 * `/frames` image stream and a read-only `ImaVidLighterTile`. The legacy
 * ImaVid looker stays reachable through `fos.legacyImaVidLooker`.
 */
export const DynamicGroupVideoTimelineSurface: React.FC<
  DynamicGroupVideoTimelineSurfaceProps
> = ({ sample }) => (
  // One mount per sample: the frame stream and the engine mode are resolved
  // at mount, and the modal renders this in place across sample navigation.
  <SurfaceForSample
    key={sample.sample._id ?? sample.sample.id}
    sample={sample}
  />
);

const SurfaceForSample: React.FC<DynamicGroupVideoTimelineSurfaceProps> = ({
  sample,
}) => {
  const prerequisites = useAnnotatePrerequisites(sample);

  useVideoExploreKeybindings();

  const dimensions = fos.useDimensions();
  const surfaceHeight = dimensions.bounds?.height ?? 0;
  const timelineMaxSize = useTimelineMaxSize(surfaceHeight);

  // Group members are frames 1..N, which is what the ImaVid looker displayed,
  // so the clock and ruler count frames rather than elapsed seconds.
  const mode = useMemo<TimelineMode>(
    () => ({
      kind: "sequence",
      fps: prerequisites.frameRate as number,
      firstFrame: 1,
    }),
    [prerequisites.frameRate],
  );

  const mediaRef = useRef<HTMLDivElement | null>(null);
  const filepath = sample.sample.filepath;
  const onRevealChange = useCallback(
    (revealed: boolean) => {
      const media = mediaRef.current;
      if (!media) {
        return;
      }
      if (!revealed) {
        media.removeAttribute(LOADED);
        return;
      }
      media.setAttribute(LOADED, "true");
      media.dispatchEvent(
        new CustomEvent(LOADED, {
          detail: { sampleFilepath: filepath },
          bubbles: true,
        }),
      );
    },
    [filepath],
  );

  if (prerequisites.status === "blocked") {
    return (
      <div className={styles.root} data-cy="modal-looker-container">
        <div className={styles.media} data-cy="looker">
          <div className={styles.empty}>This group has no frames to play.</div>
        </div>
      </div>
    );
  }

  return (
    <PlaybackProvider mode={mode}>
      {/* The image stream is the timeline's duration source, so it wraps the
          labels registrar, which gates on `useDuration() > 0`. The registrar
          stays a childless sibling so its wrapper swap remounts nothing. */}
      <RegisterImaVidImage
        source="fetch"
        frameCount={prerequisites.frameCount as number}
        frameRate={prerequisites.frameRate as number}
      >
        <RegisterVideoExploreLabels />
        <RegisterFrameLabels sample={sample} mode="explore" />
        <div
          ref={dimensions.ref as React.RefObject<HTMLDivElement>}
          data-cy="modal-looker-container"
          className={styles.root}
        >
          <div ref={mediaRef} className={styles.media} data-cy="looker">
            <ImaVidLighterTile mode="explore" onRevealChange={onRevealChange} />
          </div>
          <div className={styles.timeline}>
            <FrameLabelsTracks
              sample={sample}
              maxSize={timelineMaxSize}
              mode="explore"
              trailingActions={<VideoExploreToolbar />}
            />
          </div>
        </div>
      </RegisterImaVidImage>
    </PlaybackProvider>
  );
};
