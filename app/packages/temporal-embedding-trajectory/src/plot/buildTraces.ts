import type { SceneTrajectory } from "../types";

export type TrajectoryTraceOptions = {
  trajectoryLength: number;
  jumpThreshold: number;
  currentFrameNumber: number | null;
};

/**
 * Convert a SceneTrajectory + UI options into the Plotly trace array.
 *
 * Traces (ordered front-to-back):
 *   0. All-frames scatter (gray dots)
 *   1. Trajectory polyline + recency gradient (last N frames)
 *   2. Jump markers (red, larger)
 *   3. Current-frame cursor (single point)
 */
export function buildTraces(
  scene: SceneTrajectory,
  opts: TrajectoryTraceOptions
) {
  const { points, frame_numbers, frame_ids, jump_dists } = scene;
  const { trajectoryLength, jumpThreshold, currentFrameNumber } = opts;

  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);

  const baseScatter = {
    x: xs,
    y: ys,
    ids: frame_ids,
    customdata: frame_numbers,
    type: "scattergl" as const,
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

  // Locate the cursor index. If currentFrameNumber is null, pick the
  // last frame so the trajectory still has something to render before
  // any timeline interaction.
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

  // Jump markers: points where jump distance exceeds the threshold.
  const jumpIdxs: number[] = [];
  for (let i = 0; i < jump_dists.length; i++) {
    if (jump_dists[i] >= jumpThreshold) jumpIdxs.push(i);
  }
  const jumpsTrace = {
    x: jumpIdxs.map((i) => xs[i]),
    y: jumpIdxs.map((i) => ys[i]),
    ids: jumpIdxs.map((i) => frame_ids[i]),
    customdata: jumpIdxs.map((i) => [frame_numbers[i], jump_dists[i]]),
    type: "scattergl" as const,
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

  // Current frame cursor.
  const cursorTrace =
    cursorIdx >= 0
      ? {
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
        }
      : null;

  return cursorTrace
    ? [baseScatter, trajectoryTrace, jumpsTrace, cursorTrace]
    : [baseScatter, trajectoryTrace, jumpsTrace];
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
