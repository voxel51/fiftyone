import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import {
  Orientation,
  Spacing,
  Stack,
  Text,
  TextColor,
  TextVariant,
} from "@voxel51/voodo";
import {
  VISUALIZATION_HUD_BACKGROUND_COLOR,
  VISUALIZATION_HUD_BORDER_COLOR,
  VISUALIZATION_HUD_TEXT_COLOR,
} from "../../visualization/panels/style-tokens";

// Delay before the entity tooltip appears — long enough that sweeping the
// pointer across a scene doesn't strobe tooltips, short enough to feel
// immediate on a deliberate hover.
const HOVER_TOOLTIP_DELAY_MS = 100;
// Offset from the pointer so the tooltip never sits under the cursor.
const HOVER_TOOLTIP_OFFSET_PX = 12;
// At most this many decoded channels render in a point tooltip.
const POINT_TOOLTIP_MAX_FIELDS = 6;

/** Scene entity reported by the episode 3D hover surface. */
export interface Episode3dHoveredEntity {
  readonly kind: "entity";
  readonly stream: string;
  readonly entityId: string;
  readonly label: string | null;
}

/** Textured camera frustum reported by the episode 3D hover surface. */
export interface Episode3dHoveredCamera {
  readonly calibrationStream: string;
  readonly distortionModel?: string;
  readonly frameId?: string;
  readonly imageStream: string;
  readonly kind: "camera";
  readonly resolution: readonly [number, number];
}

/** One dwelled-on cloud point with its decoded per-point values. */
export interface Episode3dHoveredPoint {
  readonly kind: "point";
  readonly stream: string;
  readonly pointIndex: number;
  /** Sensor-frame coordinates of the point. */
  readonly position: readonly [number, number, number];
  /** Decoded scalar channels (intensity, ring, velocity…) at the index. */
  readonly fields: Readonly<Record<string, number>>;
  /** The point's rendered linear RGB color, when available. */
  readonly color?: readonly [number, number, number] | null;
  readonly frameId?: string;
}

/** Any object supported by the episode 3D hover tooltip. */
export type Episode3dHoveredObject =
  | Episode3dHoveredCamera
  | Episode3dHoveredEntity
  | Episode3dHoveredPoint;

/** Hovered object plus its tooltip position within the 3D tile. */
export type Episode3dHoverTooltipState = Episode3dHoveredObject & {
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
export function useEpisode3dHoverTooltip(): {
  readonly containerProps: {
    readonly ref: RefObject<HTMLDivElement>;
    readonly onPointerMove: (event: React.PointerEvent) => void;
  };
  readonly onHoverCamera: (hovered: Episode3dHoveredCamera | null) => void;
  readonly onHoverEntity: (hovered: Episode3dHoveredEntity | null) => void;
  readonly onHoverPoint: (hovered: Episode3dHoveredPoint | null) => void;
  readonly tooltip: Episode3dHoverTooltipState | null;
} {
  const containerRef = useRef<HTMLDivElement>(null);
  const pointerRef = useRef({ x: 0, y: 0 });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [tooltip, setTooltip] = useState<Episode3dHoverTooltipState | null>(
    null,
  );

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

  const scheduleDelayedHover = useCallback(
    <Kind extends "camera" | "entity">(
      kind: Kind,
      hovered: Extract<Episode3dHoveredObject, { readonly kind: Kind }> | null,
    ) => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (!hovered) {
        setTooltip((current) => (current?.kind === kind ? null : current));
        return;
      }
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        setTooltip({ ...hovered, ...pointerPosition() });
      }, HOVER_TOOLTIP_DELAY_MS);
    },
    [pointerPosition],
  );
  const onHoverCamera = useCallback(
    (hovered: Episode3dHoveredCamera | null) =>
      scheduleDelayedHover("camera", hovered),
    [scheduleDelayedHover],
  );
  const onHoverEntity = useCallback(
    (hovered: Episode3dHoveredEntity | null) =>
      scheduleDelayedHover("entity", hovered),
    [scheduleDelayedHover],
  );

  const onHoverPoint = useCallback(
    (hovered: Episode3dHoveredPoint | null) => {
      if (!hovered) {
        setTooltip((current) => (current?.kind === "point" ? null : current));
        return;
      }
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setTooltip({ ...hovered, ...pointerPosition() });
    },
    [pointerPosition],
  );

  return {
    containerProps: { onPointerMove, ref: containerRef },
    onHoverCamera,
    onHoverEntity,
    onHoverPoint,
    tooltip,
  };
}

const tooltipStyle: CSSProperties = {
  background: VISUALIZATION_HUD_BACKGROUND_COLOR,
  border: `1px solid ${VISUALIZATION_HUD_BORDER_COLOR}`,
  borderRadius: 8,
  color: VISUALIZATION_HUD_TEXT_COLOR,
  fontSize: 11,
  lineHeight: 1.35,
  boxShadow: "0 6px 18px rgba(0, 0, 0, 0.28)",
  maxWidth: 300,
  overflow: "hidden",
  padding: "8px 10px",
  pointerEvents: "none",
  position: "absolute",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  zIndex: 3,
};

const tooltipDetailStyle: CSSProperties = {
  display: "grid",
  gap: "2px 12px",
  gridTemplateColumns: "max-content minmax(0, 1fr)",
  margin: 0,
};

const tooltipValueStyle: CSSProperties = {
  fontVariantNumeric: "tabular-nums",
  overflow: "hidden",
  textAlign: "right",
  textOverflow: "ellipsis",
};

const tooltipHeadingStyle: CSSProperties = {
  alignItems: "center",
  display: "flex",
  gap: 6,
};

const colorBadgeStyle: CSSProperties = {
  border: "1px solid rgba(255, 255, 255, 0.35)",
  borderRadius: "50%",
  boxShadow: "0 0 0 1px rgba(0, 0, 0, 0.25)",
  flex: "0 0 auto",
  height: 8,
  width: 8,
};

/** Minimal cursor-adjacent tooltip for a hovered 3D object. */
export const Episode3dHoverTooltip: React.FC<{
  readonly tooltip: Episode3dHoverTooltipState;
}> = ({ tooltip }) => {
  return (
    <div
      data-testid="episode-3d-hover-tooltip"
      style={{
        ...tooltipStyle,
        left: tooltip.x + HOVER_TOOLTIP_OFFSET_PX,
        top: tooltip.y + HOVER_TOOLTIP_OFFSET_PX,
      }}
    >
      {tooltip.kind === "point" ? (
        <PointTooltipContent tooltip={tooltip} />
      ) : tooltip.kind === "camera" ? (
        <CameraTooltipContent tooltip={tooltip} />
      ) : (
        <EntityTooltipContent tooltip={tooltip} />
      )}
    </div>
  );
};

function CameraTooltipContent({
  tooltip,
}: {
  readonly tooltip: Episode3dHoveredCamera;
}) {
  return (
    <Stack orientation={Orientation.Column} spacing={Spacing.Xs}>
      <Text variant={TextVariant.Sm}>{tooltip.imageStream}</Text>
      <div style={tooltipDetailStyle}>
        <Text variant={TextVariant.Xs} color={TextColor.Secondary}>
          Calibration
        </Text>
        <Text variant={TextVariant.Xs} style={tooltipValueStyle}>
          {tooltip.calibrationStream}
        </Text>
        {tooltip.frameId ? (
          <>
            <Text variant={TextVariant.Xs} color={TextColor.Secondary}>
              Frame
            </Text>
            <Text variant={TextVariant.Xs} style={tooltipValueStyle}>
              {tooltip.frameId}
            </Text>
          </>
        ) : null}
        <Text variant={TextVariant.Xs} color={TextColor.Secondary}>
          Resolution
        </Text>
        <Text variant={TextVariant.Xs} style={tooltipValueStyle}>
          {tooltip.resolution[0]} × {tooltip.resolution[1]}
        </Text>
        {tooltip.distortionModel ? (
          <>
            <Text variant={TextVariant.Xs} color={TextColor.Secondary}>
              Distortion
            </Text>
            <Text variant={TextVariant.Xs} style={tooltipValueStyle}>
              {tooltip.distortionModel}
            </Text>
          </>
        ) : null}
      </div>
    </Stack>
  );
}

function EntityTooltipContent({
  tooltip,
}: {
  readonly tooltip: Episode3dHoveredEntity;
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
  readonly tooltip: Episode3dHoveredPoint;
}) {
  const fieldEntries = Object.entries(tooltip.fields);
  const shownFields = fieldEntries.slice(0, POINT_TOOLTIP_MAX_FIELDS);
  const hiddenFieldCount = fieldEntries.length - shownFields.length;
  return (
    <Stack orientation={Orientation.Column} spacing={Spacing.Xs}>
      <div style={tooltipHeadingStyle}>
        {tooltip.color ? (
          <span
            aria-label="Point color"
            style={{
              ...colorBadgeStyle,
              backgroundColor: `rgb(${tooltip.color.map((channel) => Math.round(Math.min(1, Math.max(0, channel)) * 255)).join(" ")})`,
            }}
          />
        ) : null}
        <Text variant={TextVariant.Sm}>{tooltip.stream}</Text>
      </div>
      <div style={tooltipDetailStyle}>
        <Text variant={TextVariant.Xs} color={TextColor.Secondary}>
          Point
        </Text>
        <Text variant={TextVariant.Xs} style={tooltipValueStyle}>
          #{tooltip.pointIndex}
        </Text>
        <Text variant={TextVariant.Xs} color={TextColor.Secondary}>
          Position
        </Text>
        <Text variant={TextVariant.Xs} style={tooltipValueStyle}>
          {tooltip.position.map(formatPointTooltipValue).join(", ")}
        </Text>
        {tooltip.frameId ? (
          <>
            <Text variant={TextVariant.Xs} color={TextColor.Secondary}>
              Frame
            </Text>
            <Text variant={TextVariant.Xs} style={tooltipValueStyle}>
              {tooltip.frameId}
            </Text>
          </>
        ) : null}
        {shownFields.map(([name, value]) => (
          <React.Fragment key={name}>
            <Text variant={TextVariant.Xs} color={TextColor.Secondary}>
              {name}
            </Text>
            <Text variant={TextVariant.Xs} style={tooltipValueStyle}>
              {formatPointTooltipValue(value)}
            </Text>
          </React.Fragment>
        ))}
      </div>
      {hiddenFieldCount > 0 ? (
        <Text variant={TextVariant.Xs} color={TextColor.Secondary}>
          +{hiddenFieldCount} more fields
        </Text>
      ) : null}
    </Stack>
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
