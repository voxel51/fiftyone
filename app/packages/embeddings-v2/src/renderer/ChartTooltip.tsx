import type { HoverHit } from "./types";

export interface TooltipState {
  hit: HoverHit;
  /** Flip the tooltip left/up when the point sits past the midlines */
  flipX: boolean;
  flipY: boolean;
}

interface ChartTooltipProps {
  state: TooltipState;
  /** Sample image URL for a point index; omit for text-only tooltips */
  thumbUrl?: (index: number) => string;
}

/**
 * Hover tooltip anchored to the hovered point (not the cursor).
 * Display-only: pointer-events none, so it can never steal the hover
 * it's anchored to. Styles live in embeddings.css.
 */
export function ChartTooltip({ state, thumbUrl }: ChartTooltipProps) {
  const { hit, flipX, flipY } = state;
  return (
    <div
      className="embeddings-renderer-tooltip"
      style={{
        left: hit.x,
        top: hit.y,
        transform: `translate(${flipX ? "calc(-100% - 12px)" : "12px"}, ${
          flipY ? "calc(-100% - 12px)" : "12px"
        })`,
      }}
    >
      {thumbUrl && (
        // key remounts the img per point so a stale thumbnail never
        // lingers while the next one loads
        <img key={hit.index} src={thumbUrl(hit.index)} alt="" />
      )}
      <div className="embeddings-renderer-tooltip-meta">
        {hit.label} · {hit.id}
      </div>
    </div>
  );
}
