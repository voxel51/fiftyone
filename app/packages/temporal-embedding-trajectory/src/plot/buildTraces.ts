import type { SceneTrajectory } from "../types";

export type StaticTraceOptions = {
  jumpThreshold: number;
};

export type DynamicTraceOptions = {
  trajectoryLength: number;
  currentFrameNumber: number | null;
};

// All traces here are SVG ("scatter", not "scattergl"). Two reasons:
//   1. Plotly's WebGL layer composites above SVG AND drops line-only
//      traces in plotly 3.x — mixing the two buries the cursor and makes
//      the trajectory/jump layering unreliable.
//   2. SVG updates point positions on re-render; scattergl single-point
//      traces (the cursor) freeze.
// To keep playback smooth despite SVG, the build is split into STATIC
// traces (base + jumps — independent of the current frame) and DYNAMIC
// traces (trajectory window + cursor). The component memoizes them
// separately, so the heavy base keeps a stable reference across playback
// frames and Plotly.react skips re-drawing it; only the small dynamic
// traces are redrawn each frame.

/**
 * Static traces — recomputed only when the scene or jump threshold
 * changes, NOT on every frame.
 *
 *   0. All-frames scatter (gray dots)
 *   1. Jump markers (red, larger)
 */
export function buildStaticTraces(
  scene: SceneTrajectory,
  opts: StaticTraceOptions
) {
  const { points, frame_numbers, frame_ids, jump_dists } = scene;
  const { jumpThreshold } = opts;

  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);

  const baseScatter = {
    x: xs,
    y: ys,
    ids: frame_ids,
    customdata: frame_numbers,
    type: "scatter" as const,
    mode: "markers" as const,
    name: "frames",
    marker: {
      size: 6,
      color: "rgba(160, 160, 170, 0.6)",
      line: { width: 0 },
    },
    hovertemplate:
      "frame %{customdata}<br>x=%{x:.2f} y=%{y:.2f}<extra></extra>",
  };

  const jumpIdxs: number[] = [];
  for (let i = 0; i < jump_dists.length; i++) {
    if (jump_dists[i] >= jumpThreshold) jumpIdxs.push(i);
  }
  const jumpsTrace = {
    x: jumpIdxs.map((i) => xs[i]),
    y: jumpIdxs.map((i) => ys[i]),
    ids: jumpIdxs.map((i) => frame_ids[i]),
    customdata: jumpIdxs.map((i) => [frame_numbers[i], jump_dists[i]]),
    type: "scatter" as const,
    mode: "markers" as const,
    name: "jumps",
    marker: {
      size: 11,
      color: "rgba(230, 70, 70, 0.95)",
      line: { width: 1.5, color: "rgba(255, 255, 255, 0.7)" },
      symbol: "circle",
    },
    hovertemplate:
      "frame %{customdata[0]} (jump %{customdata[1]:.3f})<extra></extra>",
  };

  return [baseScatter, jumpsTrace];
}

/**
 * Dynamic traces — recomputed every frame as the cursor moves.
 *
 *   0. Trajectory polyline + recency gradient (last N frames)
 *   1. Current-frame cursor (single yellow point, drawn last → on top)
 */
export function buildDynamicTraces(
  scene: SceneTrajectory,
  opts: DynamicTraceOptions
) {
  const { points, frame_numbers } = scene;
  const { trajectoryLength, currentFrameNumber } = opts;

  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);

  const cursorIdx = findCursorIndex(frame_numbers, currentFrameNumber);

  // Trajectory: last N points up to and including the cursor.
  const trajStart = Math.max(0, cursorIdx - trajectoryLength + 1);
  const trajIdxs: number[] = [];
  for (let i = trajStart; i <= cursorIdx; i++) trajIdxs.push(i);

  const trajectoryTrace = {
    x: trajIdxs.map((i) => xs[i]),
    y: trajIdxs.map((i) => ys[i]),
    customdata: trajIdxs.map((i) => frame_numbers[i]),
    type: "scatter" as const,
    mode: "lines+markers" as const,
    name: "trajectory",
    line: { color: "rgba(70, 140, 220, 0.85)", width: 2 },
    marker: {
      size: 7,
      color: trajIdxs.map((_, k) => {
        // recency gradient: oldest=0 → newest=1
        const t = trajIdxs.length === 1 ? 1 : k / (trajIdxs.length - 1);
        return t;
      }),
      colorscale: [
        [0, "rgba(70, 140, 220, 0.2)"],
        [1, "rgba(70, 140, 220, 1.0)"],
      ],
      cmin: 0,
      cmax: 1,
      line: { width: 0 },
    },
    hovertemplate:
      "frame %{customdata}<br>x=%{x:.2f} y=%{y:.2f}<extra></extra>",
  };

  const traces: any[] = [trajectoryTrace];

  if (cursorIdx >= 0) {
    traces.push({
      x: [xs[cursorIdx]],
      y: [ys[cursorIdx]],
      customdata: [frame_numbers[cursorIdx]],
      type: "scatter" as const,
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

  return traces;
}

export function findCursorIndex(
  frameNumbers: number[],
  currentFrameNumber: number | null
): number {
  if (frameNumbers.length === 0) return -1;
  if (currentFrameNumber == null) return frameNumbers.length - 1;
  // Exact match if possible; otherwise nearest below.
  let bestIdx = -1;
  let bestDelta = Infinity;
  for (let i = 0; i < frameNumbers.length; i++) {
    const delta = Math.abs(frameNumbers[i] - currentFrameNumber);
    if (delta < bestDelta) {
      bestDelta = delta;
      bestIdx = i;
    }
  }
  return bestIdx;
}

/**
 * Default jump threshold = mean(jump_dists) + k * std(jump_dists).
 * Returns 0 if there are fewer than 2 entries.
 */
export function defaultJumpThreshold(
  jumpDists: number[],
  k: number = 2
): number {
  const nonZero = jumpDists.filter((d) => d > 0);
  if (nonZero.length < 2) return 0;
  const mean = nonZero.reduce((a, b) => a + b, 0) / nonZero.length;
  const variance =
    nonZero.reduce((a, b) => a + (b - mean) * (b - mean), 0) / nonZero.length;
  const std = Math.sqrt(variance);
  return mean + k * std;
}
