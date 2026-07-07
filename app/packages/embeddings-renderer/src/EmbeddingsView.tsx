import { useEffect, useRef, useState } from "react";
import { ChartTooltip, type TooltipState } from "./ChartTooltip";
import "./embeddings.css";
// Type-only: erased at runtime, so three.js stays out of this chunk
import type { EmbeddingsChart } from "./EmbeddingsChart";
import type {
  CameraAdapterFactory,
  EmbeddingPoint,
  HoverHit,
  RenderSettings,
} from "./types";

export interface EmbeddingsViewProps {
  points: EmbeddingPoint[];
  /** Per-point rgb triplets in [0, 1]; omit for the default label palette */
  colors?: Float32Array | null;
  /** Per-point 0/1 visibility (view membership); omit for all visible */
  visible?: Uint8Array | null;
  /** External selection by point index; the lasso replaces it on drag */
  selected?: number[] | null;
  settings?: RenderSettings;
  /** Tooltip image URL per point index; omit for text-only tooltips */
  thumbUrl?: (index: number) => string;
  /** Lasso selections as point indices (empty = cleared) */
  onSelection?: (indices: number[]) => void;
  /** A plain click on a point; the host owns click semantics */
  onPointClick?: (hit: HoverHit) => void;
  /**
   * Camera adapter for z-carrying data; without it z is ignored and the
   * data renders flat. Fixed for the lifetime of the view.
   */
  zCamera?: CameraAdapterFactory;
}

/**
 * Thin React wrapper around the vanilla EmbeddingsChart: React manages
 * lifecycle and the tooltip DOM; all rendering stays in the chart.
 *
 * The chart module (and with it all of three.js) loads lazily on first
 * mount — importing this wrapper costs no WebGL code. Imperative hosts
 * that want the chart eagerly import "@fiftyone/embeddings-renderer/chart"
 * instead.
 */
export function EmbeddingsView({
  points,
  colors = null,
  visible = null,
  selected = null,
  settings,
  thumbUrl,
  onSelection,
  onPointClick,
  zCamera,
}: EmbeddingsViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onSelectionRef = useRef(onSelection);
  const onPointClickRef = useRef(onPointClick);
  // Captured once: the chart is constructed a single time per mount
  const zCameraRef = useRef(zCamera);
  const [chart, setChart] = useState<EmbeddingsChart | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  useEffect(() => {
    onSelectionRef.current = onSelection;
    onPointClickRef.current = onPointClick;
  }, [onSelection, onPointClick]);

  // One chart per mount, created as soon as the lazy chunk lands; props
  // flow in through the effects below, which re-fire when it does
  useEffect(() => {
    const host = containerRef.current;
    if (!host) return undefined;
    let disposed = false;
    let instance: EmbeddingsChart | null = null;
    import("./EmbeddingsChart")
      .then(({ EmbeddingsChart }) => {
        if (disposed) return;
        instance = new EmbeddingsChart(
          host,
          {
            onSelection: (indices) => onSelectionRef.current?.(indices),
            onPointClick: (hit) => onPointClickRef.current?.(hit),
            onHover: (hit) => {
              setTooltip(
                hit && {
                  hit,
                  flipX: hit.x > host.clientWidth / 2,
                  flipY: hit.y > host.clientHeight / 2,
                },
              );
            },
          },
          { zCamera: zCameraRef.current },
        );
        setChart(instance);
      })
      .catch((error) => {
        // eslint-disable-next-line no-console
        console.error("Failed to load the embeddings renderer", error);
      });
    return () => {
      disposed = true;
      setChart(null);
      instance?.destroy();
    };
  }, []);

  useEffect(() => {
    // A visible tooltip clears via the chart's own onHover(null): setData
    // resets its hover picker, which fires the callback
    chart?.setData(points);
  }, [chart, points]);

  useEffect(() => {
    // Stale colors for a previous dataset are dropped, not an error —
    // the matching colors prop lands with the host's next render
    if (colors && colors.length === points.length * 3) {
      chart?.setColors(colors);
    }
  }, [chart, colors, points]);

  useEffect(() => {
    // Same stale-prop rule as colors; null restores full visibility
    if (!visible) {
      chart?.setVisible(null);
    } else if (visible.length === points.length) {
      chart?.setVisible(visible);
    }
    // points is a dep because setData resets visibility
  }, [chart, visible, points]);

  useEffect(() => {
    chart?.setSelected(selected);
    // points is a dep because setData clears the chart's selection mask
  }, [chart, selected, points]);

  useEffect(() => {
    if (settings) chart?.setRenderSettings(settings);
  }, [chart, settings]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
      {tooltip && <ChartTooltip state={tooltip} thumbUrl={thumbUrl} />}
    </div>
  );
}
