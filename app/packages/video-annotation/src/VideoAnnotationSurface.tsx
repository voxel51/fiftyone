import { getSampleSrc } from "@fiftyone/state";
import type { ModalSample } from "@fiftyone/state";
import React, { useMemo, useState } from "react";
import { PlaybackProvider } from "../../playback/src/lib/playback/PlaybackProvider";
import {
  FRAME_FIELD,
  FrameLabelsTracks,
  RegisterFrameLabels,
} from "./FrameLabels";
import { ImaVidLighterTile } from "./ImaVidLighterTile";
import { LinkedOverlayStateBridge } from "./linkedTracks";
import { RegisterImaVidImage } from "./RegisterImaVidImage";
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

/**
 * Switch between the ImaVid (image-per-frame) tile and the native
 * `<video>` tile.
 *
 * - default: imavid (the demo's locked-in target — `to_frames(sample_frames=True)` data)
 * - `?tile=video`: native video tile (kept around for the existing path)
 *
 * Read once at mount; flipping requires reopening the modal.
 */
type TileMode = "imavid" | "video";

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

function useTileMode(): TileMode {
  const [mode] = useState<TileMode>(() => {
    if (typeof window === "undefined") {
      return "imavid";
    }

    const param = new URLSearchParams(window.location.search).get("tile");
    return param === "video" ? "video" : "imavid";
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
 * Tile mode (`?tile=imavid|video`) picks between an ImaVid tile (default,
 * one materialized image per frame via `to_frames(sample_frames=True)`)
 * and the native `<video>` tile.
 *
 * Lives inside the modal's media region — the existing right-side
 * annotation sidebar continues to render outside this component.
 */
export const VideoAnnotationSurface: React.FC<VideoAnnotationSurfaceProps> = ({
  sample,
}) => {
  const labelsMode = useLabelsMode();
  const tileMode = useTileMode();

  // The native-video tile binds to a single top-level URL. The ImaVid
  // tile resolves a per-frame URL through the image stream, so it does
  // not need (and ignores) this value.
  const videoSrc = useMemo(() => {
    if (tileMode !== "video") {
      return null;
    }

    const url = sample.urls?.[0]?.url;
    return url ? getSampleSrc(url) : null;
  }, [sample, tileMode]);

  const field = labelsMode === "synthetic" ? SYNTHETIC_FIELD : FRAME_FIELD;

  const media =
    tileMode === "imavid" ? (
      <ImaVidLighterTile field={field} />
    ) : videoSrc ? (
      <VideoLighterTile videoSrc={videoSrc} field={field} />
    ) : (
      <div className={styles.empty}>No media URL on this sample.</div>
    );

  const layout = (
    <div className={styles.root}>
      <LinkedOverlayStateBridge />
      <div className={styles.media}>{media}</div>
      <div className={styles.timeline}>
        {labelsMode === "synthetic" ? (
          <SyntheticTrackTimeline />
        ) : (
          <FrameLabelsTracks />
        )}
      </div>
    </div>
  );

  // Both registrars run against the same PlaybackProvider. In the ImaVid
  // path the image stream is the timeline's duration source (analogous to
  // `<video>` in the native tile), so it has to mount OUTSIDE the labels
  // registrar — `RegisterFrameLabels` gates on `useDuration() > 0` and
  // swaps its wrapper component when it flips ready, which would otherwise
  // remount whatever's nested inside it.
  const labels =
    labelsMode === "synthetic" ? (
      <>
        <RegisterSyntheticLabels />
        {layout}
      </>
    ) : (
      <RegisterFrameLabels sample={sample}>{layout}</RegisterFrameLabels>
    );

  const registered =
    tileMode === "imavid" ? (
      <RegisterImaVidImage sample={sample}>{labels}</RegisterImaVidImage>
    ) : (
      labels
    );

  // No TilingProvider: it mounts an isolated jotai store, which would
  // shadow modal-scoped atoms the sidebar writes to (lighterSceneAtom,
  // detection-mode, label list). Reintroducing multi-tile here requires
  // first pinning those atoms to the modal-default store explicitly.
  return <PlaybackProvider>{registered}</PlaybackProvider>;
};
