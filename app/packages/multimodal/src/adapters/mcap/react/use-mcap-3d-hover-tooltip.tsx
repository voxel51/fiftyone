import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import {
  VISUALIZATION_HUD_BACKGROUND_COLOR,
  VISUALIZATION_HUD_BORDER_COLOR,
  VISUALIZATION_HUD_TEXT_COLOR,
} from "../../../visualization/panels/style-tokens";

// Delay before the tooltip appears — long enough that sweeping the
// pointer across a scene doesn't strobe tooltips, short enough to feel
// immediate on a deliberate hover.
const HOVER_TOOLTIP_DELAY_MS = 100;
// Offset from the pointer so the tooltip never sits under the cursor.
const HOVER_TOOLTIP_OFFSET_PX = 12;

export interface Mcap3dHoveredObject {
  readonly topic: string;
  readonly entityId: string;
  readonly label: string | null;
}

export interface Mcap3dHoverTooltipState extends Mcap3dHoveredObject {
  readonly x: number;
  readonly y: number;
}

/**
 * Delayed hover tooltip for 3D scene objects. The 3D layers report
 * enter/leave through `onHoverEntity`; after a short dwell the tooltip
 * snapshots the pointer position (tracked via `containerProps`) and
 * shows the object's label/id near the cursor.
 *
 * A custom overlay rather than voodo's `Tooltip`: that component
 * anchors to a hovered DOM child, and canvas-internal objects have no
 * DOM node to anchor to.
 */
export function useMcap3dHoverTooltip(): {
  readonly containerProps: {
    readonly ref: RefObject<HTMLDivElement>;
    readonly onPointerMove: (event: React.PointerEvent) => void;
  };
  readonly onHoverEntity: (hovered: Mcap3dHoveredObject | null) => void;
  readonly tooltip: Mcap3dHoverTooltipState | null;
} {
  const containerRef = useRef<HTMLDivElement>(null);
  const pointerRef = useRef({ x: 0, y: 0 });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [tooltip, setTooltip] = useState<Mcap3dHoverTooltipState | null>(null);

  // This effect clears a pending show-timer on unmount.
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const onPointerMove = useCallback((event: React.PointerEvent) => {
    pointerRef.current = { x: event.clientX, y: event.clientY };
  }, []);

  const onHoverEntity = useCallback((hovered: Mcap3dHoveredObject | null) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (!hovered) {
      setTooltip(null);
      return;
    }
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      const rect = containerRef.current?.getBoundingClientRect();
      setTooltip({
        ...hovered,
        x: pointerRef.current.x - (rect?.left ?? 0),
        y: pointerRef.current.y - (rect?.top ?? 0),
      });
    }, HOVER_TOOLTIP_DELAY_MS);
  }, []);

  return {
    containerProps: { onPointerMove, ref: containerRef },
    onHoverEntity,
    tooltip,
  };
}

const tooltipStyle: CSSProperties = {
  background: VISUALIZATION_HUD_BACKGROUND_COLOR,
  border: `1px solid ${VISUALIZATION_HUD_BORDER_COLOR}`,
  borderRadius: 4,
  color: VISUALIZATION_HUD_TEXT_COLOR,
  fontSize: 11,
  lineHeight: 1.35,
  maxWidth: 240,
  overflow: "hidden",
  padding: "4px 7px",
  pointerEvents: "none",
  position: "absolute",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  zIndex: 3,
};

/** Minimal cursor-adjacent tooltip for a hovered 3D object. */
export const Mcap3dHoverTooltip: React.FC<{
  readonly tooltip: Mcap3dHoverTooltipState;
}> = ({ tooltip }) => {
  const title = tooltip.label ?? tooltip.entityId;
  const showId = tooltip.label !== null && tooltip.label !== tooltip.entityId;
  return (
    <div
      data-testid="mcap-3d-hover-tooltip"
      style={{
        ...tooltipStyle,
        left: tooltip.x + HOVER_TOOLTIP_OFFSET_PX,
        top: tooltip.y + HOVER_TOOLTIP_OFFSET_PX,
      }}
    >
      {title}
      {showId ? ` · ${tooltip.entityId}` : ""}
    </div>
  );
};
