import type { ModalSample } from "@fiftyone/state";
import {
  Align,
  Orientation,
  Spacing,
  Stack,
  Text,
  TextColor,
  TextVariant,
} from "@voxel51/voodo";
import { useStream } from "@fiftyone/playback";
import React, { useMemo } from "react";
import styles from "./VideoAnnotationTopBar.module.css";
import { useModalSampleFrameRate } from "../state/accessors";
import type { ImaVidImageFrame } from "../streams/ImaVidImageStream";
import { useVideoAnnotationStatusContent } from "../state/videoAnnotationStatus";
import { IMAVID_STREAM_ID } from "../utils/ids";

/**
 * Media facts shown at the top-left of the bar. Resolution and codec are
 * optional — they're absent on samples whose `VideoMetadata` wasn't fully
 * populated, so the bar simply omits them rather than rendering blanks.
 */
interface MediaInfo {
  filename: string;
  resolution: string | null;
  fps: string | null;
  codec: string | null;
}

type VideoMetadataLike = {
  frame_width?: unknown;
  frame_height?: unknown;
  encoding_str?: unknown;
};

const basename = (filepath: string): string => {
  const cleaned = filepath.replace(/[\\/]+$/, "");
  const idx = Math.max(cleaned.lastIndexOf("/"), cleaned.lastIndexOf("\\"));

  return idx >= 0 ? cleaned.slice(idx + 1) : cleaned;
};

const finitePositive = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;

/** Format fps trimming trailing zeros: 30 → "30 fps", 29.97 → "29.97 fps". */
const formatFps = (fps: number): string => `${Number(fps.toFixed(2))} fps`;

const useMediaInfo = (sample: ModalSample): MediaInfo => {
  const frameRate = useModalSampleFrameRate(sample);
  // For an ImaVid each frame is its own image sample, so the filename tracks
  // the frame under the playhead. The stream dedupes by frame number, so this
  // only changes on a real frame change; absent (native video / pre-first
  // frame) it falls back to the modal sample's filepath.
  const frame = useStream<ImaVidImageFrame>(IMAVID_STREAM_ID);
  const filepath = frame?.meta?.filepath || sample.sample.filepath;

  return useMemo(() => {
    const metadata = (
      sample.sample as { metadata?: VideoMetadataLike } | undefined
    )?.metadata;

    const width = finitePositive(metadata?.frame_width);
    const height = finitePositive(metadata?.frame_height);
    const fps = finitePositive(frameRate);
    const codec =
      typeof metadata?.encoding_str === "string" && metadata.encoding_str
        ? metadata.encoding_str
        : null;

    return {
      filename: basename(filepath),
      resolution: width && height ? `${width}×${height}` : null,
      fps: fps ? formatFps(fps) : null,
      codec,
    };
  }, [sample, frameRate, filepath]);
};

const MetaItem: React.FC<{ children: React.ReactNode; muted?: boolean }> = ({
  children,
  muted,
}) => (
  <Text
    variant={TextVariant.Sm}
    color={muted ? TextColor.Secondary : TextColor.Primary}
  >
    {children}
  </Text>
);

/**
 * Top bar for the video annotation surface. Left side shows the open sample's
 * media facts (filename, resolution, fps, codec when available); the right
 * side is a programmatically-controllable status slot driven by
 * {@link useVideoAnnotationStatus} — e.g. propagation progress.
 *
 * Mounted as the first row of the surface layout (above the media region).
 */
export const VideoAnnotationTopBar: React.FC<{ sample: ModalSample }> = ({
  sample,
}) => {
  const info = useMediaInfo(sample);
  const status = useVideoAnnotationStatusContent();

  return (
    <div className={styles.root} data-cy="video-annotation-top-bar">
      <Stack
        orientation={Orientation.Row}
        align={Align.Center}
        spacing={Spacing.Sm}
      >
        <MetaItem>{info.filename}</MetaItem>
        {info.resolution && (
          <>
            <span className={styles.sep} aria-hidden />
            <MetaItem muted>{info.resolution}</MetaItem>
          </>
        )}
        {info.fps && (
          <>
            <span className={styles.sep} aria-hidden />
            <MetaItem muted>{info.fps}</MetaItem>
          </>
        )}
        {info.codec && (
          <>
            <span className={styles.sep} aria-hidden />
            <MetaItem muted>{info.codec}</MetaItem>
          </>
        )}
      </Stack>
      <div className={styles.status} data-cy="video-annotation-status-slot">
        {status}
      </div>
    </div>
  );
};
