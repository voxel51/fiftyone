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
} from "../../../../visualization/panel-ui/style-tokens";
import type { CameraFrustumParentPosition } from "../../../../visualization/scene-3d/types";

// Delay before the entity tooltip appears — long enough that sweeping the
// pointer across a scene doesn't strobe tooltips, short enough to feel
// immediate on a deliberate hover.
const HOVER_TOOLTIP_DELAY_MS = 100;
// Offset from the pointer so the tooltip never sits under the cursor.
const HOVER_TOOLTIP_OFFSET_PX = 12;
// At most this many decoded channels render in a point tooltip.
const POINT_TOOLTIP_MAX_FIELDS = 6;

/** Scene entity reported by the episode 3D hover surface. */
export interface Scene3dHoveredEntity {
  readonly kind: "entity";
  readonly stream: string;
  readonly entityId: string;
  readonly label: string | null;
  readonly metadata: Readonly<Record<string, string>>;
  readonly texts: readonly string[];
}

/** Textured camera frustum reported by the episode 3D hover surface. */
export interface Scene3dHoveredCamera {
  readonly calibrationAssociation: "Auto-matched" | "Selected in settings";
  readonly calibrationSourceName: string;
  readonly calibrationStream: string;
  readonly distortionModel?: string;
  readonly frameId?: string;
  readonly imageLabel: string;
  readonly imageStream: string;
  readonly kind: "camera";
  readonly parentPosition: CameraFrustumParentPosition;
  readonly resolution: readonly [number, number];
}

/** One dwelled-on cloud point with its decoded per-point values. */
export interface Scene3dHoveredPoint {
  readonly kind: "point";
  /** Collision-safe presentation label for the source, when resolved. */
  readonly sourceLabel?: string;
  /** Exact format-native source name, when resolved. */
  readonly sourceName?: string;
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
export type Scene3dHoveredObject =
  | Scene3dHoveredCamera
  | Scene3dHoveredEntity
  | Scene3dHoveredPoint;

/** Hovered object plus its tooltip position within the 3D tile. */
export type Scene3dHoverTooltipState = Scene3dHoveredObject & {
  readonly x: number;
  readonly y: number;
};

type DelayedHover = Scene3dHoveredCamera | Scene3dHoveredEntity;

interface PendingDelayedHover {
  hovered: DelayedHover;
  readonly payloadKey: string;
  readonly timer: ReturnType<typeof setTimeout>;
}

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
export function useScene3dHoverTooltip(): {
  readonly containerProps: {
    readonly ref: RefObject<HTMLDivElement>;
    readonly onPointerMove: (event: React.PointerEvent) => void;
  };
  readonly onHoverCamera: (
    ownerKey: string,
    hovered: Scene3dHoveredCamera | null,
  ) => void;
  readonly onHoverEntity: (
    ownerKey: string,
    hovered: Scene3dHoveredEntity | null,
  ) => void;
  readonly onHoverPoint: (hovered: Scene3dHoveredPoint | null) => void;
  readonly tooltips: readonly Scene3dHoverTooltipState[];
} {
  const containerRef = useRef<HTMLDivElement>(null);
  const pointerRef = useRef({ x: 0, y: 0 });
  const [tooltips, setTooltips] = useState<readonly Scene3dHoverTooltipState[]>(
    [],
  );
  const tooltipEntriesRef = useRef(new Map<string, Scene3dHoverTooltipState>());
  const pendingDelayedHoversRef = useRef(
    new Map<string, PendingDelayedHover>(),
  );

  const publishTooltips = useCallback(() => {
    setTooltips(Array.from(tooltipEntriesRef.current.values()));
  }, []);

  // This effect clears a pending show-timer on unmount.
  useEffect(
    () => () => {
      for (const pending of pendingDelayedHoversRef.current.values()) {
        clearTimeout(pending.timer);
      }
      pendingDelayedHoversRef.current.clear();
      tooltipEntriesRef.current.clear();
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
    (ownerKey: string, hovered: DelayedHover | null) => {
      const pending = pendingDelayedHoversRef.current.get(ownerKey);
      if (!hovered) {
        if (pending) {
          clearTimeout(pending.timer);
          pendingDelayedHoversRef.current.delete(ownerKey);
        }
        if (tooltipEntriesRef.current.delete(ownerKey)) publishTooltips();
        return;
      }

      const payloadKey = delayedHoverKey(hovered);
      const current = tooltipEntriesRef.current.get(ownerKey);
      if (
        current &&
        current.kind !== "point" &&
        delayedHoverKey(current) === payloadKey
      ) {
        tooltipEntriesRef.current.set(ownerKey, {
          ...hovered,
          x: current.x,
          y: current.y,
        });
        publishTooltips();
        return;
      }

      if (pending?.payloadKey === payloadKey) {
        // Parent position may change every playback tick before the initial
        // dwell completes. Keep the timer but publish the newest payload.
        pending.hovered = hovered;
        return;
      }

      if (pending) clearTimeout(pending.timer);
      pendingDelayedHoversRef.current.delete(ownerKey);
      if (tooltipEntriesRef.current.delete(ownerKey)) publishTooltips();
      const timer = setTimeout(() => {
        const latest = pendingDelayedHoversRef.current.get(ownerKey);
        pendingDelayedHoversRef.current.delete(ownerKey);
        if (latest) {
          tooltipEntriesRef.current.set(ownerKey, {
            ...latest.hovered,
            ...pointerPosition(),
          });
          publishTooltips();
        }
      }, HOVER_TOOLTIP_DELAY_MS);
      pendingDelayedHoversRef.current.set(ownerKey, {
        hovered,
        payloadKey,
        timer,
      });
    },
    [pointerPosition, publishTooltips],
  );
  const onHoverCamera = useCallback(
    (ownerKey: string, hovered: Scene3dHoveredCamera | null) =>
      scheduleDelayedHover(`camera:${ownerKey}`, hovered),
    [scheduleDelayedHover],
  );
  const onHoverEntity = useCallback(
    (ownerKey: string, hovered: Scene3dHoveredEntity | null) =>
      scheduleDelayedHover(`entity:${ownerKey}`, hovered),
    [scheduleDelayedHover],
  );

  const onHoverPoint = useCallback(
    (hovered: Scene3dHoveredPoint | null) => {
      if (!hovered) {
        if (tooltipEntriesRef.current.delete("point")) publishTooltips();
        return;
      }
      for (const pending of pendingDelayedHoversRef.current.values()) {
        clearTimeout(pending.timer);
      }
      pendingDelayedHoversRef.current.clear();
      tooltipEntriesRef.current.clear();
      tooltipEntriesRef.current.set("point", {
        ...hovered,
        ...pointerPosition(),
      });
      publishTooltips();
    },
    [pointerPosition, publishTooltips],
  );

  return {
    containerProps: { onPointerMove, ref: containerRef },
    onHoverCamera,
    onHoverEntity,
    onHoverPoint,
    tooltips,
  };
}

function delayedHoverKey(hovered: DelayedHover): string {
  return hovered.kind === "camera"
    ? `camera:${hovered.calibrationStream}:${hovered.imageStream}`
    : `entity:${hovered.stream}:${hovered.entityId}`;
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

const tooltipPositionStyle: CSSProperties = {
  fontVariantNumeric: "tabular-nums",
  minWidth: "32ch",
  textAlign: "left",
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
export const Scene3dHoverTooltip: React.FC<{
  readonly tooltip: Scene3dHoverTooltipState;
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
      <Scene3dHoverTooltipContent tooltip={tooltip} />
    </div>
  );
};

/** Cursor-adjacent cards for every scene object under the pointer. */
export const Scene3dHoverTooltipStack: React.FC<{
  readonly tooltips: readonly Scene3dHoverTooltipState[];
}> = ({ tooltips }) => {
  const anchor = tooltips[0];
  if (!anchor) return null;
  return (
    <div
      data-testid="episode-3d-hover-tooltip-stack"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        left: anchor.x + HOVER_TOOLTIP_OFFSET_PX,
        pointerEvents: "none",
        position: "absolute",
        top: anchor.y + HOVER_TOOLTIP_OFFSET_PX,
        zIndex: 3,
      }}
    >
      {tooltips.map((tooltip, index) => (
        <div
          data-testid="episode-3d-hover-tooltip"
          key={`${tooltip.kind}:${index}:${tooltipIdentityKey(tooltip)}`}
          style={{
            ...tooltipStyle,
            left: undefined,
            position: "relative",
            top: undefined,
          }}
        >
          <Scene3dHoverTooltipContent tooltip={tooltip} />
        </div>
      ))}
    </div>
  );
};

function Scene3dHoverTooltipContent({
  tooltip,
}: {
  readonly tooltip: Scene3dHoverTooltipState;
}) {
  return tooltip.kind === "point" ? (
    <PointTooltipContent tooltip={tooltip} />
  ) : tooltip.kind === "camera" ? (
    <CameraTooltipContent tooltip={tooltip} />
  ) : (
    <EntityTooltipContent tooltip={tooltip} />
  );
}

function tooltipIdentityKey(tooltip: Scene3dHoverTooltipState): string {
  if (tooltip.kind === "point") {
    return `${tooltip.stream}:${tooltip.pointIndex}`;
  }
  return delayedHoverKey(tooltip);
}

function CameraTooltipContent({
  tooltip,
}: {
  readonly tooltip: Scene3dHoveredCamera;
}) {
  const parentPositionHeading =
    tooltip.parentPosition.kind === "resolved"
      ? `Position in parent (${tooltip.parentPosition.parentFrameId})`
      : "Position in parent";
  return (
    <Stack orientation={Orientation.Column} spacing={Spacing.Sm}>
      <Stack orientation={Orientation.Column} spacing={Spacing.Xs}>
        <Text variant={TextVariant.Sm}>{tooltip.imageLabel}</Text>
        <div style={tooltipDetailStyle}>
          <Text variant={TextVariant.Xs} color={TextColor.Secondary}>
            Intrinsics source
          </Text>
          <Text variant={TextVariant.Xs} style={tooltipValueStyle}>
            {tooltip.calibrationSourceName}
          </Text>
          <Text variant={TextVariant.Xs} color={TextColor.Secondary}>
            Association
          </Text>
          <Text variant={TextVariant.Xs} style={tooltipValueStyle}>
            {tooltip.calibrationAssociation}
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
      <CameraPositionBlock
        heading={parentPositionHeading}
        position={tooltip.parentPosition}
      />
    </Stack>
  );
}

function CameraPositionBlock({
  heading,
  position,
}: {
  readonly heading: string;
  readonly position: CameraFrustumParentPosition;
}) {
  return (
    <Stack orientation={Orientation.Column} spacing={Spacing.Xs}>
      <Text variant={TextVariant.Xs} color={TextColor.Secondary}>
        {heading}
      </Text>
      <Text variant={TextVariant.Xs} style={tooltipPositionStyle}>
        {position.kind === "unavailable"
          ? "Unavailable"
          : formatCameraPosition(position.origin)}
      </Text>
      {position.kind === "unavailable" ? (
        <Text variant={TextVariant.Xs} color={TextColor.Secondary}>
          Reason · {position.reason}
        </Text>
      ) : null}
    </Stack>
  );
}

function formatCameraPosition(
  origin: readonly [number, number, number],
): string {
  return `x ${formatSignedMeters(origin[0])} · y ${formatSignedMeters(
    origin[1],
  )} · z ${formatSignedMeters(origin[2])} m`;
}

function formatSignedMeters(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  const normalized = Object.is(rounded, -0) ? 0 : rounded;
  const sign = normalized < 0 ? "−" : "+";
  return `${sign}${Math.abs(normalized).toFixed(3)}`;
}

function EntityTooltipContent({
  tooltip,
}: {
  readonly tooltip: Scene3dHoveredEntity;
}) {
  const title = tooltip.label ?? tooltip.entityId;
  const showId = tooltip.label !== null && tooltip.label !== tooltip.entityId;
  const metadataEntries = Object.entries(tooltip.metadata);
  return (
    <Stack orientation={Orientation.Column} spacing={Spacing.Xs}>
      <Text variant={TextVariant.Sm}>{title}</Text>
      {showId || tooltip.texts.length > 0 || metadataEntries.length > 0 ? (
        <div style={tooltipDetailStyle}>
          {showId ? (
            <>
              <Text variant={TextVariant.Xs} color={TextColor.Secondary}>
                Entity
              </Text>
              <Text variant={TextVariant.Xs} style={tooltipValueStyle}>
                {tooltip.entityId}
              </Text>
            </>
          ) : null}
          {tooltip.texts.map((text, index) => (
            <React.Fragment key={`${index}:${text}`}>
              <Text variant={TextVariant.Xs} color={TextColor.Secondary}>
                {index === 0 ? "Text" : `Text ${index + 1}`}
              </Text>
              <Text variant={TextVariant.Xs} style={tooltipValueStyle}>
                {text}
              </Text>
            </React.Fragment>
          ))}
          {metadataEntries.map(([key, value]) => (
            <React.Fragment key={key}>
              <Text variant={TextVariant.Xs} color={TextColor.Secondary}>
                {formatMetadataKey(key)}
              </Text>
              <Text variant={TextVariant.Xs} style={tooltipValueStyle}>
                {value}
              </Text>
            </React.Fragment>
          ))}
        </div>
      ) : null}
    </Stack>
  );
}

function formatMetadataKey(key: string): string {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
  if (!words) return key;
  return words
    .replace(/\b\w/g, (character) => character.toUpperCase())
    .replace(/\bId\b/g, "ID");
}

function PointTooltipContent({
  tooltip,
}: {
  readonly tooltip: Scene3dHoveredPoint;
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
        <Text variant={TextVariant.Sm}>
          {tooltip.sourceLabel ?? "Unknown point-cloud source"}
        </Text>
      </div>
      <div style={tooltipDetailStyle}>
        <Text variant={TextVariant.Xs} color={TextColor.Secondary}>
          Source
        </Text>
        <Text variant={TextVariant.Xs} style={tooltipValueStyle}>
          {tooltip.sourceName ?? "Unknown source"}
        </Text>
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
