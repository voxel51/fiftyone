import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { ChartTooltip, type TooltipState } from "./ChartTooltip";
import "./embeddings.css";
// Type-only: erased at runtime, so three.js stays out of this chunk
import type { EmbeddingsChart } from "./EmbeddingsChart";
import type {
  CameraAdapterFactory,
  CellMembership,
  EmbeddingPoint,
  HoverHit,
  InteractionMode,
  RenderSettings,
} from "./types";

export interface EmbeddingsViewProps {
  points: EmbeddingPoint[];
  /** Per-point rgb triplets in [0, 1]; omit for the default label palette */
  colors?: Float32Array | null;
  /** Per-point 0/1 visibility (view membership), or membership in a shared
   * cell-ordinal array (`ordinals[i] === ordinal` — one array serves every
   * facet cell, no per-cell mask); omit for all visible */
  visible?: Uint8Array | CellMembership | null;
  /** External selection by point index; the lasso replaces it on drag */
  selected?: number[] | null;
  settings?: RenderSettings;
  /** Tooltip image URL per point index; omit for text-only tooltips */
  thumbUrl?: (index: number) => string;
  /** Lasso selections: point indices (empty = cleared) + the data-space
   * polygon when the camera adapter can provide one */
  onSelection?: (
    indices: number[],
    dataPolygon?: Array<[number, number]> | null,
  ) => void;
  /** A plain click on a point; the host owns click semantics */
  onPointClick?: (hit: HoverHit) => void;
  /** A plain click on empty space, after the chart clears its selection
   * — for hosts with layers of their own to clear */
  onBackgroundClick?: () => void;
  /** The lazy renderer chunk (or an injected camera) failed to load —
   * without this the chart is a permanently blank surface */
  onError?: (error: Error) => void;
  /** Debounced hover hit, or null the moment hovering breaks */
  onHover?: (hit: HoverHit | null) => void;
  /** The camera moved or the viewport resized: every point is somewhere
   * else now. Hosts anchoring chrome to a point re-project it from here. */
  onCameraChange?: () => void;
  /** Render the built-in tooltip (default). Hosts with their own hover
   * card pass false and drive it from onHover. */
  tooltip?: boolean;
  /** Plain-drag owner: "select" lassos (default), "explore" pans */
  mode?: InteractionMode;
  /**
   * Loads a camera adapter for z-carrying data; without one z is
   * ignored and the data renders flat. Async so the camera's module
   * can ship in the lazily loaded WebGL chunk instead of the host's.
   * Fixed for the lifetime of the view.
   */
  zCamera?: () => Promise<CameraAdapterFactory>;
}

/** Imperative escape hatch for host chrome (e.g. a reset-view button) */
export interface EmbeddingsViewHandle {
  resetCamera(): void;
  /** Clears the chart's local selection dimming (lasso state) */
  clearSelection(): void;
  /** Where a point sits on screen now (CSS px, relative to the cell), or
   * null when it has none — an unknown index, a point behind the camera, or
   * a chart that has not loaded yet. Chrome anchored to a point re-reads it
   * on every `onCameraChange`. */
  projectPoint(index: number): { x: number; y: number } | null;
}

/**
 * Thin React wrapper around the vanilla EmbeddingsChart: React manages
 * lifecycle and the tooltip DOM; all rendering stays in the chart.
 *
 * The chart module (and with it all of three.js) loads lazily on first
 * mount — importing this wrapper costs no WebGL code. Imperative hosts
 * that want the chart eagerly import "./EmbeddingsChart" directly
 * instead.
 */
export const EmbeddingsView = forwardRef<
  EmbeddingsViewHandle,
  EmbeddingsViewProps
>(function EmbeddingsView(
  {
    points,
    colors = null,
    visible = null,
    selected = null,
    settings,
    thumbUrl,
    onSelection,
    onPointClick,
    onBackgroundClick,
    onHover,
    onCameraChange,
    onError,
    tooltip = true,
    mode,
    zCamera,
  }: EmbeddingsViewProps,
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onSelectionRef = useRef(onSelection);
  const onPointClickRef = useRef(onPointClick);
  const onBackgroundClickRef = useRef(onBackgroundClick);
  const onHoverRef = useRef(onHover);
  const onCameraChangeRef = useRef(onCameraChange);
  const onErrorRef = useRef(onError);
  // Captured once: the chart is constructed a single time per mount
  const zCameraRef = useRef(zCamera);
  const [chart, setChart] = useState<EmbeddingsChart | null>(null);
  const [tooltipState, setTooltipState] = useState<TooltipState | null>(null);

  useEffect(() => {
    onSelectionRef.current = onSelection;
    onPointClickRef.current = onPointClick;
    onBackgroundClickRef.current = onBackgroundClick;
    onHoverRef.current = onHover;
    onCameraChangeRef.current = onCameraChange;
    onErrorRef.current = onError;
  }, [
    onSelection,
    onPointClick,
    onBackgroundClick,
    onHover,
    onCameraChange,
    onError,
  ]);

  useImperativeHandle(
    ref,
    () => ({
      resetCamera: () => chart?.resetCamera(),
      projectPoint: (index: number) => chart?.projectPoint(index) ?? null,
      // Drops BOTH selection layers (host + lasso) — this is the
      // explicit-clear path (Esc, clear affordances)
      clearSelection: () => chart?.clearSelection(),
    }),
    [chart],
  );

  // One chart per mount, created as soon as the lazy chunk lands; props
  // flow in through the effects below, which re-fire when it does
  useEffect(() => {
    const host = containerRef.current;
    if (!host) return undefined;
    let disposed = false;
    let instance: EmbeddingsChart | null = null;
    Promise.all([import("./EmbeddingsChart"), zCameraRef.current?.()])
      .then(([{ EmbeddingsChart }, zCamera]) => {
        if (disposed) return;
        instance = new EmbeddingsChart(
          host,
          {
            onSelection: (indices, dataPolygon) =>
              onSelectionRef.current?.(indices, dataPolygon),
            onPointClick: (hit) => onPointClickRef.current?.(hit),
            onBackgroundClick: () => onBackgroundClickRef.current?.(),
            onCameraChange: () => onCameraChangeRef.current?.(),
            onHover: (hit) => {
              onHoverRef.current?.(hit);
              setTooltipState(
                hit && {
                  hit,
                  flipX: hit.x > host.clientWidth / 2,
                  flipY: hit.y > host.clientHeight / 2,
                },
              );
            },
          },
          { zCamera },
        );
        setChart(instance);
      })
      .catch((error) => {
        // eslint-disable-next-line no-console
        console.error("Failed to load the embeddings renderer", error);
        if (disposed) return;
        onErrorRef.current?.(
          error instanceof Error ? error : new Error(String(error)),
        );
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
    if (mode) chart?.setInteractionMode(mode);
  }, [chart, mode]);

  useEffect(() => {
    // Stale colors for a previous dataset are dropped, not an error —
    // the matching colors prop lands with the host's next render. Null
    // restores the default palette (color-by None, or a column fetch
    // in flight)
    if (!colors) {
      chart?.setColors(null);
    } else if (colors.length === points.length * 3) {
      chart?.setColors(colors);
    }
  }, [chart, colors, points]);

  // Destructured so the effect keys on the SHARED ordinal array and the
  // cell's ordinal, not on the wrapper object a facet layout recreates
  // every render
  const visibleMask = visible instanceof Uint8Array ? visible : null;
  const visibleOrdinals =
    visible && !(visible instanceof Uint8Array) ? visible.ordinals : null;
  const visibleOrdinal =
    visible && !(visible instanceof Uint8Array) ? visible.ordinal : -1;
  useEffect(() => {
    // Same stale-prop rule as colors; null restores full visibility
    if (visibleMask) {
      if (visibleMask.length === points.length) chart?.setVisible(visibleMask);
    } else if (visibleOrdinals) {
      if (visibleOrdinals.length === points.length) {
        chart?.setVisible({
          ordinals: visibleOrdinals,
          ordinal: visibleOrdinal,
        });
      }
    } else {
      chart?.setVisible(null);
    }
    // points is a dep because setData resets visibility
  }, [chart, visibleMask, visibleOrdinals, visibleOrdinal, points]);

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
      {tooltip && tooltipState && (
        <ChartTooltip state={tooltipState} thumbUrl={thumbUrl} />
      )}
    </div>
  );
});
