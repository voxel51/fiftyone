import { getSampleSrc } from "@fiftyone/state";
import type { ModalSample } from "@fiftyone/state";
import { TilingProvider } from "@fiftyone/tiling";
import React, { useMemo, useState } from "react";
import { PlaybackProvider } from "../../playback/src/lib/playback/PlaybackProvider";
import {
  FRAME_FIELD,
  FrameLabelsTracks,
  RegisterFrameLabels,
} from "./FrameLabels";
import { LinkedOverlayStateBridge } from "./linkedTracks";
import {
  RegisterSyntheticLabels,
  SYNTHETIC_FIELD,
  SyntheticTrackTimeline,
} from "./SyntheticLabels";
import { VideoLighterTile } from "./VideoLighterTile";
import styles from "./VideoAnnotationSurface.module.css";

/**
 * Switch between the synthetic stream (for testing the rendering path
 * without real labels) and the real `/frames`-backed stream.
 *
 * - default: real
 * - `?labels=synthetic`: synthetic
 *
 * Read once at mount; flipping requires reopening the modal.
 */
type LabelsMode = "real" | "synthetic";

function useLabelsMode(): LabelsMode {
  const [mode] = useState<LabelsMode>(() => {
    if (typeof window === "undefined") {
      return "real";
    }

    const param = new URLSearchParams(window.location.search).get("labels");
    return param === "synthetic" ? "synthetic" : "real";
  });

  return mode;
}

export interface VideoAnnotationSurfaceProps {
  sample: ModalSample;
}

/**
 * Composition root for the video annotation surface. Wires
 * PlaybackProvider + TrackProvider + TilingProvider, registers a labels
 * stream (real `/frames` by default; synthetic when `?labels=synthetic`),
 * and renders media (top) + timeline (bottom).
 *
 * Lives inside the modal's media region — the existing right-side
 * annotation sidebar continues to render outside this component.
 */
export const VideoAnnotationSurface: React.FC<VideoAnnotationSurfaceProps> = ({
  sample,
}) => {
  const mode = useLabelsMode();
  const videoSrc = useMemo(() => {
    const url = sample.urls?.[0]?.url;
    return url ? getSampleSrc(url) : null;
  }, [sample]);

  const field = mode === "synthetic" ? SYNTHETIC_FIELD : FRAME_FIELD;

  const layout = (
    <div className={styles.root}>
      <LinkedOverlayStateBridge />
      <div className={styles.media}>
        {videoSrc ? (
          <VideoLighterTile videoSrc={videoSrc} field={field} />
        ) : (
          <div className={styles.empty}>No media URL on this sample.</div>
        )}
      </div>
      <div className={styles.timeline}>
        {mode === "synthetic" ? (
          <SyntheticTrackTimeline />
        ) : (
          <FrameLabelsTracks />
        )}
      </div>
    </div>
  );

  return (
    <PlaybackProvider>
      <TilingProvider initialTiles={{}}>
        {mode === "synthetic" ? (
          <>
            <RegisterSyntheticLabels />
            {layout}
          </>
        ) : (
          <RegisterFrameLabels sample={sample}>{layout}</RegisterFrameLabels>
        )}
      </TilingProvider>
    </PlaybackProvider>
  );
};
