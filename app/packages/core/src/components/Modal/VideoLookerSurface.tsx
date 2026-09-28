/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { VideoLooker } from "@fiftyone/looker";
import { PlaybackProvider, type TimelineMode } from "@fiftyone/playback";
import * as fos from "@fiftyone/state";
import {
  FrameLabelsTracks,
  RegisterFrameLabels,
  getModalSampleFrameRate,
  useTimelineMaxSize,
} from "@fiftyone/video-annotation";
import { BackgroundColor, getColorCssVar } from "@voxel51/voodo";
import React, { useMemo } from "react";
import { useSavedVideoSegments } from "./useSavedVideoSegments";
import { useLookerPlaybackBridge } from "./useLookerPlaybackBridge";
import styles from "./VideoLookerSurface.module.css";
import useLooker from "./use-looker";
import { useVideoModalSelectiveRendering } from "./use-modal-selective-rendering";

const CARD_BACKGROUND: React.CSSProperties = {
  background: `var(${getColorCssVar(BackgroundColor.Card1)})`,
};

/**
 * The looker half: a `VideoLooker` attached to this host, bound to the
 * surrounding timeline by {@link useLookerPlaybackBridge}. The looker owns
 * the media, the label overlays and every interaction on the picture.
 */
const VideoLookerReact: React.FC<{
  sample: fos.ModalSample;
  frameRate: number | undefined;
}> = ({ sample, frameRate }) => {
  const { id, ref, looker } = useLooker<VideoLooker>({ sample });

  useVideoModalSelectiveRendering(id, looker);
  useLookerPlaybackBridge(looker, frameRate);

  return (
    <div
      ref={ref}
      id={id}
      data-cy="modal-looker-container"
      style={{ width: "100%", height: "100%", position: "relative" }}
    />
  );
};

/**
 * The video sample surface in the modal's Explore mode: the video looker with
 * the shared timeline docked beneath it.
 *
 * Rendering is the looker's, unchanged from before the timeline existed:
 * every label type, zoom and pan, tooltips, the JSON and help panels, and the
 * looker's keyboard shortcuts. The timeline replaces only the looker's own
 * transport bar (hidden by this surface's stylesheet), and the two are kept
 * in step by {@link useLookerPlaybackBridge}.
 *
 * `RegisterFrameLabels` and `FrameLabelsTracks` are the read-only track
 * data under the ruler; they read the server's label index and paint nothing
 * on the media.
 */
export const VideoLookerSurface: React.FC<{ sample: fos.ModalSample }> = ({
  sample,
}) => {
  // Measure the surface so the timeline body caps at a fraction of it: past
  // the cap the drawer scrolls internally instead of growing into the media.
  const dimensions = fos.useDimensions();
  const surfaceHeight = dimensions.bounds?.height ?? 0;
  const timelineMaxSize = useTimelineMaxSize(surfaceHeight);

  const frameRate = getModalSampleFrameRate(sample);
  const savedSegments = useSavedVideoSegments(sample.sample._id, frameRate);

  // Sequence mode when the frame rate is known, so the engine steps whole
  // frames and the ruler can count them; elapsed seconds if not.
  const mode = useMemo<TimelineMode>(
    () =>
      frameRate && Number.isFinite(frameRate) && frameRate > 0
        ? { kind: "sequence", fps: frameRate }
        : { kind: "duration" },
    [frameRate],
  );

  // `PlaybackProvider` resolves `mode` at mount only, so a sample with a
  // different frame rate has to remount it.
  const clockKey =
    mode.kind === "sequence" ? `sequence:${mode.fps}` : mode.kind;
  const playbackKey = `${sample.sample._id}:${clockKey}:${savedSegments.pinScopeKey ?? ""}`;

  return (
    <PlaybackProvider key={playbackKey} mode={mode} defaultDisplay="duration">
      {/* Registers the label stream the tracks read. A SIBLING of the media:
          it re-keys on the resolved frame count, and nesting the looker under
          it would rebuild the looker on the way to ready. */}
      <RegisterFrameLabels
        sample={sample}
        mode="explore"
        initialTime={savedSegments.initialTime}
      />
      <div
        ref={dimensions.ref as React.RefObject<HTMLDivElement>}
        className={styles.root}
      >
        <div className={styles.media} style={CARD_BACKGROUND}>
          <VideoLookerReact sample={sample} frameRate={frameRate} />
        </div>
        <div className={styles.timeline} style={CARD_BACKGROUND}>
          <FrameLabelsTracks
            sample={sample}
            maxSize={timelineMaxSize}
            mode="explore"
            additionalTracks={savedSegments.tracks}
            initialPinnedIds={savedSegments.initialPinnedIds}
            pinScopeKey={savedSegments.pinScopeKey}
          />
        </div>
      </div>
    </PlaybackProvider>
  );
};
