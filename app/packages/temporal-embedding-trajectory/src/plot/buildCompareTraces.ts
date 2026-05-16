import type { SceneTrajectory } from "../types";
import { defaultJumpThreshold } from "./buildTraces";

// A small palette that's distinguishable on the panel's dark background.
// Add more colors if we ever want > 6 brain keys at once.
const COMPARE_PALETTE = [
  "rgba(70, 140, 220, 0.95)", // blue
  "rgba(230, 130, 50, 0.95)", // orange
  "rgba(80, 200, 140, 0.95)", // green
  "rgba(200, 100, 200, 0.95)", // magenta
  "rgba(230, 220, 80, 0.95)", // yellow
  "rgba(120, 200, 220, 0.95)", // cyan
];

export type CompareTraceOptions = {
  scenes: Array<{ brainKey: string; scene: SceneTrajectory }>;
  jumpSigma: number;
  currentFrameNumber: number | null;
};

export type CompareYAxisDomain = {
  maxJump: number;
  maxFrame: number;
};

/**
 * Build Plotly traces for compare mode.
 *
 * X = frame_number (shared across all models).
 * Y = consecutive-frame cosine distance (per model — each model is one line).
 *
 * Per scene:
 *  - line trace: dots + line connecting frames in order
 *  - jump trace: larger markers for frames whose jump distance exceeds the
 *    scene's own (mean + sigma*std) threshold (computed per scene since
 *    models live in different distance scales).
 *
 * Plus one vertical-line shape at currentFrameNumber.
 */
export function buildCompareTraces(opts: CompareTraceOptions) {
  const { scenes, jumpSigma, currentFrameNumber } = opts;

  let maxJump = 0;
  let maxFrame = 0;

  const traces: any[] = [];

  scenes.forEach(({ brainKey, scene }, i) => {
    const color = COMPARE_PALETTE[i % COMPARE_PALETTE.length];
    const { frame_numbers, jump_dists, frame_ids } = scene;

    const threshold = defaultJumpThreshold(jump_dists, jumpSigma);

    for (const j of jump_dists) {
      if (j > maxJump) maxJump = j;
    }
    for (const f of frame_numbers) {
      if (f > maxFrame) maxFrame = f;
    }

    traces.push({
      x: frame_numbers,
      y: jump_dists,
      ids: frame_ids,
      customdata: frame_numbers.map((fn, k) => [brainKey, fn, jump_dists[k]]),
      type: "scattergl" as const,
      mode: "lines+markers" as const,
      name: brainKey,
      line: { color, width: 1.5 },
      marker: { size: 4, color },
      hovertemplate:
        "<b>%{customdata[0]}</b><br>frame %{customdata[1]}<br>" +
        "jump %{customdata[2]:.3f}<extra></extra>",
    });

    const jumpFrames: number[] = [];
    const jumpYs: number[] = [];
    const jumpIds: string[] = [];
    const jumpCustom: any[] = [];
    for (let k = 0; k < jump_dists.length; k++) {
      if (jump_dists[k] >= threshold && threshold > 0) {
        jumpFrames.push(frame_numbers[k]);
        jumpYs.push(jump_dists[k]);
        jumpIds.push(frame_ids[k]);
        jumpCustom.push([brainKey, frame_numbers[k], jump_dists[k]]);
      }
    }
    if (jumpFrames.length) {
      traces.push({
        x: jumpFrames,
        y: jumpYs,
        ids: jumpIds,
        customdata: jumpCustom,
        type: "scattergl" as const,
        mode: "markers" as const,
        name: `${brainKey} jumps`,
        showlegend: false,
        marker: {
          size: 11,
          color,
          line: { width: 1.5, color: "rgba(255, 255, 255, 0.85)" },
          symbol: "circle",
        },
        hovertemplate:
          "<b>%{customdata[0]} jump</b><br>frame %{customdata[1]}<br>" +
          "jump %{customdata[2]:.3f}<extra></extra>",
      });
    }
  });

  return { traces, domain: { maxJump, maxFrame } };
}

export function compareLayout(
  domain: CompareYAxisDomain,
  currentFrameNumber: number | null
): any {
  const shapes: any[] = [];
  if (currentFrameNumber != null && domain.maxFrame > 0) {
    shapes.push({
      type: "line",
      x0: currentFrameNumber,
      x1: currentFrameNumber,
      y0: 0,
      y1: domain.maxJump > 0 ? domain.maxJump * 1.05 : 1,
      yref: "y",
      line: { color: "rgba(255, 220, 80, 0.9)", width: 2, dash: "solid" },
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
        text: "jump (cosine dist)",
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
