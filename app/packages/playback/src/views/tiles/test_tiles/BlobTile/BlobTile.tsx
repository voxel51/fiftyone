import { useAtomValue } from "jotai";
import React, { useEffect, useMemo } from "react";
import { playheadAtom } from "../../../../lib/playback/atoms";
import { usePlayback } from "../../../../lib/playback/PlaybackProvider";
import type { PlaybackStream } from "../../../../lib/playback/types";
import { useStream } from "../../../../lib/playback/use-stream";
import { useTileId } from "@fiftyone/tiling";
import styles from "./BlobTile.module.css";

const STREAM_DURATION = 20;

/**
 * A non-blocking stream — always reports "ready". Exists only so the
 * tile contributes to the engine's overall duration calculation; the
 * rendered blob is a pure function of the playhead.
 */
function createBlobStream(id: string): PlaybackStream {
  return {
    id,
    blocking: false,
    duration: STREAM_DURATION,
    bufferState: () => "ready",
  };
}

/**
 * Non-blocking demo tile: an animated SVG gradient blob whose path,
 * colors, and rotation are derived from the current playhead. Registers a
 * non-blocking stream of duration 20s so the timeline picks up a sensible
 * length, but it never stalls the clock.
 */
const BlobTile: React.FC = () => {
  const tileId = useTileId();
  const { registerStream } = usePlayback();

  const streamId = tileId ?? "blob";
  const stream = useMemo(() => createBlobStream(streamId), [streamId]);

  useEffect(() => registerStream(stream), [registerStream, stream]);
  // Subscribe so the engine considers the stream active. (Without a
  // subscriber the engine would skip it for duration purposes too in
  // future iterations — keep it active explicitly.)
  useStream(streamId);

  const t = useAtomValue(playheadAtom);
  const path = useMemo(() => blobPath(t), [t]);
  const gradient = useMemo(() => blobColors(t), [t]);
  const rotation = (t * 12) % 360;
  const gradId = `blobGrad-${streamId}`;

  return (
    <div className={styles.body}>
      <svg viewBox="-100 -100 200 200" className={styles.svg}>
        <defs>
          <radialGradient id={gradId} cx="0.3" cy="0.3" r="0.8">
            <stop offset="0%" stopColor={gradient.inner} />
            <stop offset="60%" stopColor={gradient.mid} />
            <stop offset="100%" stopColor={gradient.outer} />
          </radialGradient>
        </defs>
        <g transform={`rotate(${rotation})`}>
          <path d={path} fill={`url(#${gradId})`} />
        </g>
      </svg>
      <span className={styles.label}>blob · t={t.toFixed(2)}s</span>
    </div>
  );
};

const BLOB_POINTS = 8;
const BLOB_BASE_RADIUS = 60;
const BLOB_RADIUS_AMPLITUDE = 18;

/**
 * Build a closed smooth path by perturbing the radius of a polar
 * sampling around the origin. Using quadratic curves between adjacent
 * sample midpoints keeps the path smooth (no visible vertices).
 */
function blobPath(t: number): string {
  const points: Array<[number, number]> = [];
  for (let i = 0; i < BLOB_POINTS; i++) {
    const angle = (i / BLOB_POINTS) * Math.PI * 2;
    // Two independent sines per point so neighbours wobble at different
    // phases — gives a more organic deformation than a single wave.
    const wobble =
      Math.sin(t * 0.9 + i * 1.3) * 0.6 +
      Math.sin(t * 1.7 + i * 0.7) * 0.4;
    const r = BLOB_BASE_RADIUS + wobble * BLOB_RADIUS_AMPLITUDE;
    points.push([Math.cos(angle) * r, Math.sin(angle) * r]);
  }

  const segments: string[] = [];
  for (let i = 0; i < points.length; i++) {
    const cur = points[i];
    const next = points[(i + 1) % points.length];
    const midX = (cur[0] + next[0]) / 2;
    const midY = (cur[1] + next[1]) / 2;
    if (i === 0) segments.push(`M ${midX} ${midY}`);
    const after = points[(i + 1) % points.length];
    const afterNext = points[(i + 2) % points.length];
    const nextMidX = (after[0] + afterNext[0]) / 2;
    const nextMidY = (after[1] + afterNext[1]) / 2;
    segments.push(`Q ${after[0]} ${after[1]} ${nextMidX} ${nextMidY}`);
  }
  segments.push("Z");
  return segments.join(" ");
}

function blobColors(t: number): { inner: string; mid: string; outer: string } {
  const hue1 = (t * 18) % 360;
  const hue2 = (hue1 + 60) % 360;
  const hue3 = (hue1 + 180) % 360;
  return {
    inner: `hsl(${hue1}, 90%, 70%)`,
    mid: `hsl(${hue2}, 85%, 55%)`,
    outer: `hsl(${hue3}, 70%, 25%)`,
  };
}

export default BlobTile;
