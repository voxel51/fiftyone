/**
 * One plot cell: a single embeddings chart over the run's SHARED
 * `points`/`colors`/`selected` arrays, scoped to this cell by its
 * `visible` mask. Cells never own selection/color state — they read the
 * run-level composition from {@link useRunPlotData} — so a lasso, a color,
 * and a grid selection stay identical across every cell for free.
 *
 * The plain panel renders exactly one full-size cell; an extension layout
 * may render many (each with its own mask over the same arrays). The cell
 * registers its imperative chart handle with the run (so clear/reset fan
 * out to all cells) and renders its own hover card: cell membership is
 * exclusive, so the hovered point belongs to exactly one cell and its
 * coordinates are relative to that cell's canvas.
 */
import { Text, TextColor, TextVariant } from "@voxel51/voodo";
import { useCallback, useRef, type ReactNode } from "react";
import HoverCard from "./HoverCard";
import "./panel.css";
import {
  EmbeddingsView,
  type CameraAdapterFactory,
  type HoverHit,
  type InteractionMode,
} from "./renderer";
import type { HoverAction } from "./extensions";
import type { HoverContent } from "./HoverCard";
import type { Loaded } from "./useRunColumns";
import type { EmbeddingsViewHandle } from "./renderer";

export interface FacetCellProps {
  cellKey: string;
  /** Row/col category labels for this cell; null when that axis is absent */
  rowLabel: string | null;
  colLabel: string | null;
  /** Number of points visible in this cell (from the cell mask) */
  count: number;
  /** Caller-supplied controls rendered at the header's right edge */
  headerActions?: ReactNode;

  loaded: Loaded;
  colors: Float32Array | null;
  selected: number[] | null;
  /** plot visibility ∧ this cell's membership */
  visible: Uint8Array;
  /** The renderer's own mode — the shell maps any extension mode before
   * it reaches the cell */
  mode: InteractionMode;
  zCamera?: () => Promise<CameraAdapterFactory>;

  onLasso: (
    indices: number[],
    polygon?: Array<[number, number]> | null,
  ) => void;
  /** What a point click does in the current mode; undefined = clicks do
   * nothing (explore) */
  onPointClick: ((hit: HoverHit) => void) | undefined;
  onBackgroundClick: () => void;
  /** The cell's renderer failed; the run surfaces it as the plot's error */
  onError: (e: Error) => void;
  onHover: (hit: HoverHit | null) => void;
  /** Keeps the hover card alive while the pointer is over it */
  onKeepHover: () => void;
  /** An extension action offered on the hover card; null = no button */
  hoverAction: HoverAction | null;
  registerChart: (key: string, handle: EmbeddingsViewHandle | null) => void;

  /** Shared hover state; the card shows only when the hovered point is a
   * member of this cell */
  hover: HoverContent | null;
  /** The live hovered hit — rings the point instantly, ahead of the card's
   * dwell. Optional so extension-rendered cells opt in when ready. */
  hoverHit?: HoverHit | null;
}

export default function FacetCell({
  cellKey,
  rowLabel,
  colLabel,
  count,
  headerActions,
  loaded,
  colors,
  selected,
  visible,
  mode,
  zCamera,
  onLasso,
  onPointClick,
  onBackgroundClick,
  onError,
  onHover,
  onKeepHover,
  hoverAction,
  registerChart,
  hover,
  hoverHit = null,
}: FacetCellProps) {
  const sceneRef = useRef<HTMLDivElement>(null);
  const setChart = useCallback(
    (handle: EmbeddingsViewHandle | null) => registerChart(cellKey, handle),
    [cellKey, registerChart],
  );

  const label = [rowLabel, colLabel].filter((v) => v !== null).join(" · ");
  const showHover = hover != null && visible[hover.hit.index] === 1;
  // Same membership rule as the card: a point rings only in its own cell
  const showRing = hoverHit != null && visible[hoverHit.index] === 1;

  return (
    <div className="emb-facet-cell">
      {label && (
        <div className="emb-facet-cell-header">
          <Text
            variant={TextVariant.Sm}
            color={TextColor.Fg}
            className="emb-facet-cell-header-label"
            title={label}
          >
            {label}
          </Text>
          <span className="emb-facet-cell-header-end">
            <Text variant={TextVariant.Xs} color={TextColor.Tertiary}>
              {count.toLocaleString()}
            </Text>
            {headerActions}
          </span>
        </div>
      )}
      <div ref={sceneRef} className="emb-facet-cell-scene">
        <EmbeddingsView
          ref={setChart}
          points={loaded.points}
          colors={colors}
          visible={visible}
          selected={selected}
          tooltip={false}
          mode={mode}
          zCamera={zCamera}
          onSelection={onLasso}
          onPointClick={onPointClick}
          onBackgroundClick={onBackgroundClick}
          onError={onError}
          onHover={onHover}
        />
        {showRing && hoverHit && (
          <span
            className="emb-hover-ring"
            style={{ left: hoverHit.x, top: hoverHit.y }}
          />
        )}
        {showHover && (
          <HoverCard
            content={hover}
            origin={(() => {
              const rect = sceneRef.current?.getBoundingClientRect();
              return { left: rect?.left ?? 0, top: rect?.top ?? 0 };
            })()}
            onKeepHover={onKeepHover}
            onLeave={() => onHover(null)}
            action={
              hoverAction
                ? {
                    label: hoverAction.label,
                    run: () => hoverAction.run(hover.hit),
                  }
                : undefined
            }
          />
        )}
      </div>
    </div>
  );
}
