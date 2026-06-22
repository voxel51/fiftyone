import type { SceneTrajectory } from "../types";
import { findCursorIndex } from "./buildTraces";
import { findPeaks, thresholdFromScores } from "./buildScenesTraces";

/**
 * "Segment scatter" view (scene-mining mode `scatter_b`).
 *
 * Same UMAP geometry as the plain Scatter tab — each point is one
 * frame at its embedding-space position — but points are COLORED by
 * which scene segment they belong to. Segments come from the
 * windowed `scene_shift` peaks (the same boundaries the Scenes tab
 * draws), so a "scene" is the span between two adjacent boundaries.
 *
 * Why this is useful for scene mining:
 *   - If the embedding genuinely captures distinct scenes, each
 *     segment should form its own cluster — you can SEE the
 *     segmentation quality at a glance.
 *   - A frame whose color sits inside a different segment's cluster
 *     is temporally in one scene but visually in another — exactly
 *     the "out of place" anomaly (tree-shadow-as-pothole) the panel
 *     was built to surface.
 */

// Categorical palette, distinguishable on the dark panel background.
// Cycles if there are more segments than colors.
const SEGMENT_PALETTE = [
  "rgba(70, 140, 220, 0.9)", // blue
  "rgba(230, 130, 50, 0.9)", // orange
  "rgba(80, 200, 140, 0.9)", // green
  "rgba(200, 100, 200, 0.9)", // magenta
  "rgba(120, 200, 220, 0.9)", // cyan
  "rgba(230, 200, 80, 0.9)", // gold
  "rgba(180, 120, 240, 0.9)", // purple
  "rgba(240, 120, 120, 0.9)", // salmon
];

export type SegmentScatterOptions = {
  /** Threshold sigma over scene_shift for boundary (peak) detection. */
  sigma: number;
  /** Minimum gap (in frames) between two accepted boundaries. */
  minPeakDistance: number;
  /** Active video frame number for the cursor point. */
  currentFrameNumber: number | null;
};

export type SegmentAnchor = {
  frameId: string;
  frameNumber: number;
  segmentId: number;
  color: string;
};

export type SegmentScatterPlot = {
  traces: any[];
  /** One anchor (first frame) per segment, for the thumbnail strip. */
  segments: SegmentAnchor[];
  numSegments: number;
};

/**
 * Boundary indices (into the scene's parallel arrays) derived from the
 * scene_shift peaks. Empty when there's no scene_shift data or no peak
 * clears the threshold — in that case the whole clip is one segment.
 */
export function segmentBoundaryIdxs(
  scene: SceneTrajectory,
  sigma: number,
  minPeakDistance: number
): number[] {
  const scores = scene.scene_shifts ?? [];
  if (scores.length === 0) return [];
  const threshold = thresholdFromScores(scores, sigma);
  return findPeaks(scores, threshold, minPeakDistance);
}

export function buildSegmentScatterTraces(
  scene: SceneTrajectory,
  opts: SegmentScatterOptions
): SegmentScatterPlot {
  const { points, frame_numbers, frame_ids } = scene;
  const { sigma, minPeakDistance, currentFrameNumber } = opts;

  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const n = frame_numbers.length;

  const boundaries = segmentBoundaryIdxs(scene, sigma, minPeakDistance);
  // Split points partition the frame range into [start, end) segments.
  const splitPoints = [0, ...boundaries, n];

  const traces: any[] = [];
  const segments: SegmentAnchor[] = [];

  // Faint connecting line in temporal order — SVG (not scattergl), so
  // it renders *under* the WebGL segment markers. Lets the eye follow
  // the trajectory and spot a frame that jumps across clusters.
  if (n >= 2) {
    traces.push({
      x: xs,
      y: ys,
      type: "scatter" as const,
      mode: "lines" as const,
      name: "path",
      showlegend: false,
      line: { color: "rgba(150,150,160,0.25)", width: 1 },
      hoverinfo: "skip" as const,
    });
  }

  let segId = 0;
  for (let s = 0; s < splitPoints.length - 1; s++) {
    const start = splitPoints[s];
    const end = splitPoints[s + 1];
    if (end <= start) continue;

    const idxs: number[] = [];
    for (let i = start; i < end; i++) idxs.push(i);

    const color = SEGMENT_PALETTE[segId % SEGMENT_PALETTE.length];
    const label = `scene ${segId + 1}`;

    traces.push({
      x: idxs.map((i) => xs[i]),
      y: idxs.map((i) => ys[i]),
      ids: idxs.map((i) => frame_ids[i]),
      customdata: idxs.map((i) => [frame_numbers[i], segId + 1]),
      type: "scattergl" as const,
      mode: "markers" as const,
      name: label,
      marker: { size: 7, color, line: { width: 0 } },
      hovertemplate: "frame %{customdata[0]} · %{fullData.name}<extra></extra>",
    });

    segments.push({
      frameId: frame_ids[start],
      frameNumber: frame_numbers[start],
      segmentId: segId,
      color,
    });
    segId++;
  }

  // Current-frame cursor, on top. scattergl so it shares the WebGL
  // layer with the segment markers and composites above them.
  const cursorIdx = findCursorIndex(frame_numbers, currentFrameNumber);
  if (cursorIdx >= 0) {
    traces.push({
      x: [xs[cursorIdx]],
      y: [ys[cursorIdx]],
      customdata: [frame_numbers[cursorIdx]],
      type: "scattergl" as const,
      mode: "markers" as const,
      name: "current",
      showlegend: false,
      marker: {
        size: 14,
        color: "rgba(255, 220, 80, 1.0)",
        line: { width: 2, color: "rgba(20, 20, 20, 0.9)" },
        symbol: "circle",
      },
      hovertemplate: "current: frame %{customdata}<extra></extra>",
    });
  }

  return { traces, segments, numSegments: segId };
}

/** Layout for the segment scatter — UMAP axes, legend on for segments. */
export function segmentScatterLayout(): any {
  return {
    autosize: true,
    margin: { l: 36, r: 8, t: 8, b: 32 },
    showlegend: true,
    legend: {
      orientation: "h",
      x: 0,
      y: 1.08,
      bgcolor: "rgba(0,0,0,0)",
      font: { color: "rgba(220,220,220,0.9)", size: 11 },
    },
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    xaxis: {
      zeroline: false,
      showgrid: true,
      gridcolor: "rgba(120,120,120,0.15)",
      tickfont: { size: 10, color: "rgba(180,180,180,0.85)" },
    },
    yaxis: {
      zeroline: false,
      showgrid: true,
      gridcolor: "rgba(120,120,120,0.15)",
      tickfont: { size: 10, color: "rgba(180,180,180,0.85)" },
      scaleanchor: "x",
      scaleratio: 1,
    },
    hoverlabel: {
      bgcolor: "rgba(20,20,30,0.92)",
      bordercolor: "rgba(70,70,90,0.6)",
      font: { color: "rgba(240,240,240,0.95)", size: 11 },
    },
  };
}
