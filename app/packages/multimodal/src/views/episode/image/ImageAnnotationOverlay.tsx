import type { CSSProperties, RefObject } from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import {
  imageDisplayRect,
  transformedImageDisplayRect,
  type ImageViewTransform,
} from "../../../visualization/media-2d/Base2dScene";
import type { GpuImageAnnotationPickerHandle } from "../../../visualization/media-2d/GpuImageAnnotationPicker";
import type {
  PreparedImageAnnotationMetadata,
  PreparedImageAnnotations,
} from "../../../visualization/media-2d/gpu-image-annotation-preparation";
import {
  POINT_HOVER_DWELL_MS,
  POINT_HOVER_MOVE_TOLERANCE_PX,
} from "../../../visualization/interaction/hover-inspect";
import { attachPointerDwell } from "../../../visualization/interaction/pointer-dwell";
import {
  VISUALIZATION_HUD_BACKGROUND_COLOR,
  VISUALIZATION_HUD_BORDER_COLOR,
  VISUALIZATION_HUD_TEXT_COLOR,
} from "../../../visualization/panel-ui/style-tokens";

const PICK_RADIUS_SCREEN_PX = 6;
const TOOLTIP_OFFSET_PX = 12;

interface AnnotationTooltip {
  readonly metadata: PreparedImageAnnotationMetadata;
  readonly x: number;
  readonly y: number;
}

/** DOM interaction inputs for GPU-rendered image annotations. */
export interface ImageAnnotationOverlayProps {
  readonly fit: "contain" | "cover";
  readonly imageHeight: number;
  readonly imageWidth: number;
  readonly onHoverPrimitive: (primitiveIndex: number | null) => void;
  readonly onSelectPrimitive: (
    primitiveIndex: number,
    shiftKey: boolean,
  ) => void;
  readonly pickerRef: RefObject<GpuImageAnnotationPickerHandle>;
  readonly prepared: PreparedImageAnnotations;
  readonly sourceLabelsById: ReadonlyMap<string, string>;
  readonly viewTransform?: ImageViewTransform;
}

/**
 * DOM interaction shell for GPU-rendered image annotations. It owns dwell,
 * click, and tooltip presentation only; no annotation shape becomes a DOM
 * element.
 */
export default function ImageAnnotationOverlay({
  fit,
  imageHeight,
  imageWidth,
  onHoverPrimitive,
  onSelectPrimitive,
  pickerRef,
  prepared,
  sourceLabelsById,
  viewTransform,
}: ImageAnnotationOverlayProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const requestGenerationRef = useRef(0);
  const [tooltip, setTooltip] = useState<AnnotationTooltip | null>(null);

  const fitRef = useRef(fit);
  fitRef.current = fit;
  const imageDimsRef = useRef({ height: imageHeight, width: imageWidth });
  imageDimsRef.current = { height: imageHeight, width: imageWidth };
  const metadataRef = useRef(prepared.metadata);
  metadataRef.current = prepared.metadata;
  const onHoverRef = useRef(onHoverPrimitive);
  onHoverRef.current = onHoverPrimitive;
  const onSelectRef = useRef(onSelectPrimitive);
  onSelectRef.current = onSelectPrimitive;
  const viewTransformRef = useRef(viewTransform);
  viewTransformRef.current = viewTransform;

  // This layout effect invalidates pending reads when frame metadata changes.
  useLayoutEffect(() => {
    requestGenerationRef.current += 1;
    pickerRef.current?.invalidate();
    setTooltip(null);
    onHoverRef.current(null);
  }, [pickerRef, prepared]);

  // This effect keeps one native pointer subscription while metadata churns.
  useEffect(() => {
    const surface = containerRef.current?.parentElement;
    if (!surface) return undefined;
    let pointerDown: { readonly x: number; readonly y: number } | null = null;
    let pointerDragged = false;

    const clearHover = () => {
      requestGenerationRef.current += 1;
      pickerRef.current?.invalidate();
      setTooltip(null);
      onHoverRef.current(null);
    };

    const requestPick = (
      clientX: number,
      clientY: number,
      consumer: (
        metadata: PreparedImageAnnotationMetadata,
        primitiveIndex: number,
        pointer: { readonly x: number; readonly y: number },
      ) => void,
    ) => {
      const container = containerRef.current;
      const picker = pickerRef.current;
      const dims = imageDimsRef.current;
      if (!container || !picker || dims.width <= 0 || dims.height <= 0) {
        clearHover();
        return;
      }
      const bounds = container.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0) {
        clearHover();
        return;
      }
      const rect = transformedImageDisplayRect(
        imageDisplayRect(
          { height: bounds.height, width: bounds.width },
          dims,
          fitRef.current,
        ),
        viewTransformRef.current,
      );
      if (rect.width <= 0 || rect.height <= 0) {
        clearHover();
        return;
      }
      const pointer = {
        x: clientX - bounds.left,
        y: clientY - bounds.top,
      };
      const targetU = ((pointer.x - rect.x) / rect.width) * dims.width;
      const targetV = ((pointer.y - rect.y) / rect.height) * dims.height;
      const imagePxPerScreenPx = dims.width / rect.width;
      const generation = ++requestGenerationRef.current;
      void picker
        .pick({
          radiusPx: PICK_RADIUS_SCREEN_PX * imagePxPerScreenPx,
          targetU,
          targetV,
        })
        .then((pick) => {
          if (generation !== requestGenerationRef.current || !pick) {
            if (generation === requestGenerationRef.current) clearHover();
            return;
          }
          const metadata = metadataRef.current[pick.primitiveIndex];
          if (!metadata) {
            clearHover();
            return;
          }
          consumer(metadata, pick.primitiveIndex, pointer);
        })
        .catch(() => {
          if (generation === requestGenerationRef.current) clearHover();
        });
    };

    const detachDwell = attachPointerDwell(surface, {
      dwellMs: POINT_HOVER_DWELL_MS,
      moveTolerancePx: POINT_HOVER_MOVE_TOLERANCE_PX,
      onCancel: clearHover,
      onDwell: (clientX, clientY) =>
        requestPick(clientX, clientY, (metadata, primitiveIndex, pointer) => {
          setTooltip({ metadata, ...pointer });
          onHoverRef.current(primitiveIndex);
        }),
    });
    const handlePointerDown = (event: PointerEvent) => {
      pointerDown = { x: event.clientX, y: event.clientY };
      pointerDragged = false;
    };
    const handlePointerMove = (event: PointerEvent) => {
      if (
        pointerDown &&
        Math.hypot(
          event.clientX - pointerDown.x,
          event.clientY - pointerDown.y,
        ) > POINT_HOVER_MOVE_TOLERANCE_PX
      ) {
        pointerDragged = true;
      }
    };
    const handlePointerCancel = () => {
      pointerDown = null;
      pointerDragged = false;
    };
    const handleClick = (event: MouseEvent) => {
      pointerDown = null;
      if (event.defaultPrevented || pointerDragged) {
        pointerDragged = false;
        return;
      }
      requestPick(event.clientX, event.clientY, (_metadata, primitiveIndex) =>
        onSelectRef.current(primitiveIndex, event.shiftKey),
      );
    };
    surface.addEventListener("pointerdown", handlePointerDown);
    surface.addEventListener("pointermove", handlePointerMove);
    surface.addEventListener("pointercancel", handlePointerCancel);
    surface.addEventListener("pointerleave", handlePointerCancel);
    surface.addEventListener("click", handleClick);
    return () => {
      surface.removeEventListener("click", handleClick);
      surface.removeEventListener("pointerdown", handlePointerDown);
      surface.removeEventListener("pointermove", handlePointerMove);
      surface.removeEventListener("pointercancel", handlePointerCancel);
      surface.removeEventListener("pointerleave", handlePointerCancel);
      detachDwell();
      clearHover();
    };
  }, [pickerRef]);

  return (
    <div
      data-episode-image-annotation-overlay
      ref={containerRef}
      style={containerStyle}
    >
      {tooltip ? (
        <ImageAnnotationTooltip
          streamLabel={
            sourceLabelsById.get(tooltip.metadata.stream) ??
            tooltip.metadata.stream
          }
          tooltip={tooltip}
        />
      ) : null}
    </div>
  );
}

function ImageAnnotationTooltip({
  streamLabel,
  tooltip,
}: {
  readonly streamLabel: string;
  readonly tooltip: AnnotationTooltip;
}) {
  const { metadata } = tooltip;
  const type =
    metadata.primitive.kind === "circle"
      ? "Circle"
      : humanizePrimitiveType(metadata.primitive.value.type);
  return (
    <div
      data-testid="episode-image-annotation-tooltip"
      style={{
        ...tooltipStyle,
        left: tooltip.x + TOOLTIP_OFFSET_PX,
        top: tooltip.y + TOOLTIP_OFFSET_PX,
      }}
    >
      <div style={headingStyle}>
        <span
          aria-hidden
          style={{ ...colorBadgeStyle, background: metadata.color }}
        />
        <span>{metadata.label ?? type}</span>
      </div>
      <div style={detailStyle}>
        <span style={detailLabelStyle}>Type</span>
        <span>{type}</span>
        <span style={detailLabelStyle}>Stream</span>
        <span style={detailValueStyle}>{streamLabel}</span>
      </div>
    </div>
  );
}

function humanizePrimitiveType(value: string): string {
  return value
    .split("-")
    .map((part) => (part[0]?.toUpperCase() ?? "") + part.slice(1))
    .join(" ");
}

const containerStyle: CSSProperties = {
  inset: 0,
  overflow: "hidden",
  pointerEvents: "none",
  position: "absolute",
};

const tooltipStyle: CSSProperties = {
  background: VISUALIZATION_HUD_BACKGROUND_COLOR,
  border: `1px solid ${VISUALIZATION_HUD_BORDER_COLOR}`,
  borderRadius: 8,
  boxShadow: "0 6px 18px rgba(0, 0, 0, 0.28)",
  color: VISUALIZATION_HUD_TEXT_COLOR,
  display: "grid",
  fontSize: 11,
  gap: 6,
  lineHeight: 1.35,
  maxWidth: 300,
  overflow: "hidden",
  padding: "8px 10px",
  pointerEvents: "none",
  position: "absolute",
  whiteSpace: "nowrap",
  zIndex: 4,
};

const headingStyle: CSSProperties = {
  alignItems: "center",
  display: "flex",
  fontWeight: 600,
  gap: 6,
};

const colorBadgeStyle: CSSProperties = {
  border: "1px solid rgba(255, 255, 255, 0.35)",
  borderRadius: "50%",
  height: 8,
  width: 8,
};

const detailStyle: CSSProperties = {
  display: "grid",
  gap: "2px 12px",
  gridTemplateColumns: "max-content minmax(0, 1fr)",
};

const detailLabelStyle: CSSProperties = {
  color: "#94a3b8",
};

const detailValueStyle: CSSProperties = {
  maxWidth: 220,
  overflow: "hidden",
  textOverflow: "ellipsis",
};
