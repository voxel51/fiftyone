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

// Delay before the entity tooltip appears — long enough that sweeping the
// pointer across a scene doesn't strobe tooltips, short enough to feel
// immediate on a deliberate hover.
const HOVER_TOOLTIP_DELAY_MS = 100;
// Offset from the pointer so the tooltip never sits under the cursor.
const HOVER_TOOLTIP_OFFSET_PX = 12;
// At most this many decoded channels render in a point tooltip.
const POINT_TOOLTIP_MAX_FIELDS = 6;

/** Scene entity reported by the MCAP 3D hover surface. */
export interface Mcap3dHoveredEntity {
  readonly kind: "entity";
  readonly topic: string;
  readonly entityId: string;
  readonly label: string | null;
}

/** One dwelled-on cloud point with its decoded per-point values. */
export interface Mcap3dHoveredPoint {
  readonly kind: "point";
  readonly topic: string;
  readonly pointIndex: number;
  /** Sensor-frame coordinates of the point. */
  readonly position: readonly [number, number, number];
  /** Decoded scalar channels (intensity, ring, velocity…) at the index. */
  readonly fields: Readonly<Record<string, number>>;
  readonly frameId?: string;
}

export type Mcap3dHoveredObject = Mcap3dHoveredEntity | Mcap3dHoveredPoint;

export type Mcap3dHoverTooltipState = Mcap3dHoveredObject & {
  readonly x: number;
  readonly y: number;
};

/**
 * Delayed hover tooltip for 3D scene objects. The 3D layers report
 * enter/leave through `onHoverEntity`; after a short dwell the tooltip
 * snapshots the pointer position (tracked via `containerProps`) and
 * shows the object's label/id near the cursor.
 *
 * Cloud points arrive through `onHoverPoint` instead and show
 * immediately: their dwell already elapsed in the scene-side picking
 * layer (the raycast only runs once the pointer rests), so a second
 * delay here would just feel laggy.
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
  readonly onHoverEntity: (hovered: Mcap3dHoveredEntity | null) => void;
  readonly onHoverPoint: (hovered: Mcap3dHoveredPoint | null) => void;
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

  const pointerPosition = useCallback(() => {
    const rect = containerRef.current?.getBoundingClientRect();
    return {
      x: pointerRef.current.x - (rect?.left ?? 0),
      y: pointerRef.current.y - (rect?.top ?? 0),
    };
  }, []);

  const onHoverEntity = useCallback(
    (hovered: Mcap3dHoveredEntity | null) => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (!hovered) {
        setTooltip((current) => (current?.kind === "entity" ? null : current));
        return;
      }
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        setTooltip({ ...hovered, ...pointerPosition() });
      }, HOVER_TOOLTIP_DELAY_MS);
    },
    [pointerPosition],
  );

  const onHoverPoint = useCallback(
    (hovered: Mcap3dHoveredPoint | null) => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (!hovered) {
        setTooltip((current) => (current?.kind === "point" ? null : current));
        return;
      }
      setTooltip({ ...hovered, ...pointerPosition() });
    },
    [pointerPosition],
  );

  return {
    containerProps: { onPointerMove, ref: containerRef },
    onHoverEntity,
    onHoverPoint,
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
  maxWidth: 260,
  overflow: "hidden",
  padding: "4px 7px",
  pointerEvents: "none",
  position: "absolute",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  zIndex: 3,
};

const tooltipDetailStyle: CSSProperties = {
  opacity: 0.82,
};

/** Minimal cursor-adjacent tooltip for a hovered 3D object. */
export const Mcap3dHoverTooltip: React.FC<{
  readonly tooltip: Mcap3dHoverTooltipState;
}> = ({ tooltip }) => {
  return (
    <div
      data-testid="mcap-3d-hover-tooltip"
      style={{
        ...tooltipStyle,
        left: tooltip.x + HOVER_TOOLTIP_OFFSET_PX,
        top: tooltip.y + HOVER_TOOLTIP_OFFSET_PX,
      }}
    >
      {tooltip.kind === "point" ? (
        <PointTooltipContent tooltip={tooltip} />
      ) : (
        <EntityTooltipContent tooltip={tooltip} />
      )}
    </div>
  );
};

function EntityTooltipContent({
  tooltip,
}: {
  readonly tooltip: Mcap3dHoveredEntity;
}) {
  const title = tooltip.label ?? tooltip.entityId;
  const showId = tooltip.label !== null && tooltip.label !== tooltip.entityId;
  return (
    <>
      {title}
      {showId ? ` · ${tooltip.entityId}` : ""}
    </>
  );
}

function PointTooltipContent({
  tooltip,
}: {
  readonly tooltip: Mcap3dHoveredPoint;
}) {
  const fieldEntries = Object.entries(tooltip.fields);
  const shownFields = fieldEntries.slice(0, POINT_TOOLTIP_MAX_FIELDS);
  const hiddenFieldCount = fieldEntries.length - shownFields.length;
  return (
    <>
      <div>
        {tooltip.topic} · #{tooltip.pointIndex}
      </div>
      <div style={tooltipDetailStyle}>
        {tooltip.position
          .map((component) => formatPointTooltipValue(component))
          .join(", ")}
        {tooltip.frameId ? ` · ${tooltip.frameId}` : ""}
      </div>
      {shownFields.map(([name, value]) => (
        <div key={name} style={tooltipDetailStyle}>
          {name}: {formatPointTooltipValue(value)}
        </div>
      ))}
      {hiddenFieldCount > 0 ? (
        <div style={tooltipDetailStyle}>+{hiddenFieldCount} more</div>
      ) : null}
    </>
  );
}

/** Compact numeric readout: up to 4 significant digits, no exponent noise. */
export function formatPointTooltipValue(value: number): string {
  if (!Number.isFinite(value)) {
    return String(value);
  }
  if (Number.isInteger(value)) {
    return value.toString();
  }
  return Number(value.toPrecision(4)).toString();
}
