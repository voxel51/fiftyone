import {
  Align,
  Orientation,
  Spacing,
  Stack,
  Text,
  TextColor,
  TextVariant,
} from "@voxel51/voodo";
import React, { useMemo } from "react";
import { useAnnotationStatusContent } from "../state/annotationStatus";
import styles from "./AnnotationTopBar.module.css";

/** Sample metadata. */
interface MediaInfo {
  filename: string;
  resolution: string | null;
  fps: string | null;
  codec: string | null;
}

/**
 * Structural subset of `fiftyone.core.metadata.ImageMetadata` /
 * `VideoMetadata` on the wire.
 */
type MediaMetadataLike = {
  frame_width?: unknown;
  frame_height?: unknown;
  width?: unknown;
  height?: unknown;
  encoding_str?: unknown;
};

/**
 * Structural view of the modal sample — typed locally so this package needs
 * no `@fiftyone/state` dependency. `frameRate` exists only on the video
 * variant of the sample response.
 */
export interface AnnotationTopBarSample {
  sample: { filepath: string; metadata?: MediaMetadataLike };
  frameRate?: number;
}

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

const useMediaInfo = (sample: AnnotationTopBarSample): MediaInfo => {
  return useMemo(() => {
    const metadata = sample.sample.metadata;

    // Video metadata carries frame_width/frame_height; image metadata
    // carries width/height.
    const width =
      finitePositive(metadata?.frame_width) ?? finitePositive(metadata?.width);
    const height =
      finitePositive(metadata?.frame_height) ??
      finitePositive(metadata?.height);
    const fps = finitePositive(sample.frameRate);
    const codec =
      typeof metadata?.encoding_str === "string" && metadata.encoding_str
        ? metadata.encoding_str
        : null;

    return {
      filename: basename(sample.sample.filepath),
      resolution: width && height ? `${width}×${height}` : null,
      fps: fps ? formatFps(fps) : null,
      codec,
    };
  }, [sample]);
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
 * Top bar shared by the annotation surfaces (image and video). Left side
 * shows the open sample's media facts (filename, resolution, and — for
 * video — fps and codec when available); the right side is a
 * programmatically-controllable status slot driven by
 * {@link useAnnotationStatus} — e.g. propagation progress.
 *
 * Mounted as the first row of the surface layout (above the media region).
 */
export const AnnotationTopBar: React.FC<{
  sample: AnnotationTopBarSample;
}> = ({ sample }) => {
  const info = useMediaInfo(sample);
  const status = useAnnotationStatusContent();

  return (
    <div className={styles.root} data-cy="annotation-top-bar">
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
      <div className={styles.status} data-cy="annotation-status-slot">
        {status}
      </div>
    </div>
  );
};
