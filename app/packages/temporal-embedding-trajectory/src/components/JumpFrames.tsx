import React, { useMemo } from "react";
import { getSampleSrc } from "@fiftyone/state";
import { ImageList, Orientation } from "@voxel51/voodo";

const DEFAULT_THUMB_SIZE = 80;
const THUMB_GAP = 6;
const SINGLE_ROW_MAX = 12;

export type JumpFrame = {
  frameId: string;
  frameNumber: number;
  // Optional badge color (e.g. for "only A" vs "both" sets).
  accent?: string;
  // Optional numeric score (e.g. jump distance, scene shift).
  // Renders as a second line on the badge so users can see anomaly
  // magnitude without hovering.
  score?: number;
};

export type JumpFramesProps = {
  title?: string;
  frames: JumpFrame[];
  media: Record<string, string>;
  onClickFrame?: (frameNumber: number) => void;
  // If true, scrolls horizontally; if false, the parent must size it.
  scrollHorizontally?: boolean;
  // Override the per-cell pixel size. Defaults to 80; the context
  // preview row passes ~140 so the user can read the small differences.
  thumbSize?: number;
};

/**
 * Strip of thumbnails for "jump" frames.
 *
 * Each thumbnail is the frame image fetched from getSampleSrc(filepath),
 * with a frame-number badge overlay. Clicking calls onClickFrame so the
 * parent can seek the video.
 */
export default function JumpFrames({
  title,
  frames,
  media,
  onClickFrame,
  scrollHorizontally = true,
  thumbSize = DEFAULT_THUMB_SIZE,
}: JumpFramesProps) {
  const items = useMemo(
    () =>
      frames.map((f) => ({
        id: f.frameId,
        data: {
          filepath: media[f.frameId],
          frameNumber: f.frameNumber,
          accent: f.accent,
          score: f.score,
        },
      })),
    [frames, media]
  );

  if (frames.length === 0) {
    return (
      <div style={styles.section}>
        {title ? <div style={styles.title}>{title} · 0</div> : null}
        <div style={styles.empty}>no jumps</div>
      </div>
    );
  }

  const rows = frames.length <= SINGLE_ROW_MAX && scrollHorizontally ? 1 : 2;
  const containerHeight = thumbSize * rows + THUMB_GAP * Math.max(0, rows - 1);

  return (
    <div style={styles.section}>
      {title ? (
        <div style={styles.title}>
          {title} · {frames.length}
        </div>
      ) : null}
      <ImageList
        orientation={scrollHorizontally ? Orientation.Row : Orientation.Column}
        cols={rows}
        colWidth={thumbSize}
        gap={THUMB_GAP}
        style={{ height: containerHeight, width: "100%" }}
        items={items as any}
        renderItem={(data: any) => {
          const filepath = data?.filepath as string | undefined;
          const accent = data?.accent as string | undefined;
          const frameNumber = data?.frameNumber as number;
          const score = data?.score as number | undefined;
          return (
            <div
              style={{
                ...styles.thumb,
                ...(accent ? { boxShadow: `0 0 0 2px ${accent}` } : {}),
              }}
              onClick={() => onClickFrame?.(frameNumber)}
              title={
                score != null
                  ? `frame ${frameNumber} · ${score.toFixed(3)}`
                  : `frame ${frameNumber}`
              }
            >
              {filepath ? (
                <img
                  src={getSampleSrc(filepath)}
                  alt={`frame ${frameNumber}`}
                  style={styles.thumbImg}
                />
              ) : (
                <div style={styles.thumbPlaceholder}>?</div>
              )}
              <div style={styles.badge}>
                <span>{frameNumber}</span>
                {score != null ? (
                  <span style={styles.badgeScore}>{score.toFixed(3)}</span>
                ) : null}
              </div>
            </div>
          );
        }}
      />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  section: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    minHeight: 0,
  },
  title: {
    fontSize: 11,
    color: "rgba(200,200,220,0.85)",
    padding: "0 12px",
  },
  empty: {
    color: "rgba(140,140,160,0.65)",
    fontSize: 11,
    padding: "4px 12px",
  },
  thumb: {
    position: "relative",
    width: "100%",
    height: "100%",
    borderRadius: 3,
    overflow: "hidden",
    background: "rgba(40,40,55,0.6)",
    cursor: "pointer",
  },
  thumbImg: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
  },
  thumbPlaceholder: {
    width: "100%",
    height: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "rgba(180,180,200,0.6)",
    fontSize: 14,
  },
  badge: {
    position: "absolute",
    bottom: 2,
    left: 2,
    background: "rgba(10,10,15,0.78)",
    color: "rgba(240,240,250,0.95)",
    fontSize: 10,
    padding: "1px 4px",
    borderRadius: 2,
    display: "flex",
    flexDirection: "column",
    lineHeight: 1.1,
  },
  badgeScore: {
    fontSize: 9,
    color: "rgba(180,200,255,0.85)",
  },
};
