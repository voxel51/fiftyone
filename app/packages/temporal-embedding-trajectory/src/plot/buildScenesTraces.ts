import type { SceneTrajectory } from "../types";

export type ScenesTraceOptions = {
  scenes: Array<{ brainKey: string; scene: SceneTrajectory; color: string }>;
  /** Threshold sigma over the score for peak detection. */
  sigma: number;
  /** Minimum gap (in frames) between two accepted peaks. */
  minPeakDistance: number;
  /** Active video frame number for the cursor line. */
  currentFrameNumber: number | null;
};

export type SceneBoundary = {
  brainKey: string;
  /** Frame number at the peak of the boundary score. */
  frameNumber: number;
  /** Index into the scene's parallel arrays. */
  idx: number;
  /** scene_shift value at the peak. */
  score: number;
};

export type ScenesPlot = {
  traces: any[];
  domain: { maxScore: number; maxFrame: number };
  /** Boundaries grouped by brain key, sorted by frame_number. */
  boundariesByKey: Record<string, SceneBoundary[]>;
};

/**
 * Build traces for the Scenes view: one scene_shift line per brain key,
 * peaks marked, vertical cursor at the current frame.
 *
 * Peak detection: a local maximum of scene_shift whose value exceeds
 * mean(scores) + sigma * std(scores) AND is the max within
 * ±minPeakDistance frames.
 */
export function buildScenesTraces(opts: ScenesTraceOptions): ScenesPlot {
  const { scenes, sigma, minPeakDistance, currentFrameNumber } = opts;

  let maxScore = 0;
  let maxFrame = 0;
  const traces: any[] = [];
  const boundariesByKey: Record<string, SceneBoundary[]> = {};

  scenes.forEach(({ brainKey, scene, color }) => {
    const scores = scene.scene_shifts ?? [];
    const { frame_numbers, frame_ids } = scene;

    for (const v of scores) if (v > maxScore) maxScore = v;
    for (const f of frame_numbers) if (f > maxFrame) maxFrame = f;

    const threshold = thresholdFromScores(scores, sigma);
    const peaks = findPeaks(scores, threshold, minPeakDistance);

    boundariesByKey[brainKey] = peaks.map((idx) => ({
      brainKey,
      frameNumber: frame_numbers[idx],
      idx,
      score: scores[idx],
    }));

    traces.push({
      x: frame_numbers,
      y: scores,
      ids: frame_ids,
      customdata: frame_numbers.map((fn, k) => [brainKey, fn, scores[k]]),
      // SVG (not scattergl): plotly 3.x's WebGL renderer drops line-only
      // traces (blank chart) and its gl canvas hides the yellow cursor-line
      // shape in scenesLayout. SVG is plenty fast at this scale.
      type: "scatter" as const,
      mode: "lines" as const,
      name: brainKey,
      line: { color, width: 1.5 },
      hovertemplate:
        "<b>%{customdata[0]}</b><br>frame %{customdata[1]}<br>" +
        "shift %{customdata[2]:.3f}<extra></extra>",
    });

    if (peaks.length) {
      traces.push({
        x: peaks.map((i) => frame_numbers[i]),
        y: peaks.map((i) => scores[i]),
        ids: peaks.map((i) => frame_ids[i]),
        customdata: peaks.map((i) => [brainKey, frame_numbers[i], scores[i]]),
        // SVG too — keeps the scenes plot off the WebGL layer so the
        // cursor-line shape stays visible (see the line trace above).
        type: "scatter" as const,
        mode: "markers" as const,
        name: `${brainKey} peaks`,
        showlegend: false,
        marker: {
          size: 11,
          color,
          line: { width: 1.5, color: "rgba(255, 255, 255, 0.85)" },
          symbol: "diamond",
        },
        hovertemplate:
          "<b>%{customdata[0]} boundary</b><br>frame %{customdata[1]}<br>" +
          "shift %{customdata[2]:.3f}<extra></extra>",
      });
    }
  });

  return {
    traces,
    domain: { maxScore, maxFrame },
    boundariesByKey,
  };
}

export function scenesLayout(
  domain: { maxScore: number; maxFrame: number },
  currentFrameNumber: number | null
): any {
  const shapes: any[] = [];
  if (currentFrameNumber != null && domain.maxFrame > 0) {
    shapes.push({
      type: "line",
      x0: currentFrameNumber,
      x1: currentFrameNumber,
      y0: 0,
      y1: domain.maxScore > 0 ? domain.maxScore * 1.05 : 1,
      yref: "y",
      line: { color: "rgba(255, 220, 80, 0.9)", width: 2 },
    });
  }

  return {
    autosize: true,
    margin: { l: 48, r: 8, t: 8, b: 36 },
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
      title: {
        text: "frame",
        font: { size: 11, color: "rgba(180,180,200,0.85)" },
      },
      zeroline: false,
      showgrid: true,
      gridcolor: "rgba(120,120,120,0.15)",
      tickfont: { size: 10, color: "rgba(180,180,180,0.85)" },
    },
    yaxis: {
      title: {
        text: "scene shift (window centroid)",
        font: { size: 11, color: "rgba(180,180,200,0.85)" },
      },
      zeroline: false,
      showgrid: true,
      gridcolor: "rgba(120,120,120,0.15)",
      tickfont: { size: 10, color: "rgba(180,180,180,0.85)" },
      rangemode: "tozero",
    },
    shapes,
    hoverlabel: {
      bgcolor: "rgba(20,20,30,0.92)",
      bordercolor: "rgba(70,70,90,0.6)",
      font: { color: "rgba(240,240,240,0.95)", size: 11 },
    },
  };
}

/**
 * Build per-segment thumbnail picks (one frame per scene) for a single
 * brain key. A "scene" is the span between adjacent boundary peaks (or
 * the start/end of the trajectory). Returns the first frame of each
 * segment, which is the most natural "this scene starts here" anchor.
 */
export function scenesFromBoundaries(
  scene: SceneTrajectory,
  boundaries: SceneBoundary[]
): Array<{
  frameId: string;
  frameNumber: number;
  startFrame: number;
  endFrame: number;
}> {
  const { frame_numbers, frame_ids } = scene;
  if (frame_numbers.length === 0) return [];

  const boundaryIdxs = boundaries.map((b) => b.idx).sort((a, b) => a - b);
  const splitPoints = [0, ...boundaryIdxs, frame_numbers.length];

  const segments: Array<{
    frameId: string;
    frameNumber: number;
    startFrame: number;
    endFrame: number;
  }> = [];

  for (let s = 0; s < splitPoints.length - 1; s++) {
    const start = splitPoints[s];
    const end = splitPoints[s + 1];
    if (end <= start) continue;
    segments.push({
      frameId: frame_ids[start],
      frameNumber: frame_numbers[start],
      startFrame: frame_numbers[start],
      endFrame: frame_numbers[end - 1],
    });
  }

  return segments;
}

// ── helpers ────────────────────────────────────────────────────────────

export function thresholdFromScores(scores: number[], sigma: number): number {
  const nonZero = scores.filter((s) => s > 0);
  if (nonZero.length < 2) return 0;
  const mean = nonZero.reduce((a, b) => a + b, 0) / nonZero.length;
  const variance =
    nonZero.reduce((a, b) => a + (b - mean) * (b - mean), 0) / nonZero.length;
  const std = Math.sqrt(variance);
  return mean + sigma * std;
}

export function findPeaks(
  values: number[],
  threshold: number,
  minDistance: number
): number[] {
  const peaks: number[] = [];
  if (threshold <= 0) return peaks;
  const n = values.length;
  for (let i = 1; i < n - 1; i++) {
    const v = values[i];
    if (v < threshold) continue;
    // Local-max check within a +/- minDistance window.
    let isMax = true;
    const a = Math.max(0, i - minDistance);
    const b = Math.min(n, i + minDistance + 1);
    for (let j = a; j < b; j++) {
      if (j !== i && values[j] > v) {
        isMax = false;
        break;
      }
    }
    if (!isMax) continue;
    // De-dup against already-accepted peaks within minDistance.
    if (peaks.length && i - peaks[peaks.length - 1] < minDistance) continue;
    peaks.push(i);
  }
  return peaks;
}
