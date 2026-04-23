import type {
  Image2dOverlayPrimitive,
  Image2dOverlayPoint,
} from "./archetypes";
import { foxgloveColorToCss } from "./foxglove-color";
import { decodeFoxgloveImageAnnotationsMessage } from "./foxglove-protobuf";

const POINT_ANNOTATION_POINTS = 1;
const POINT_ANNOTATION_LINE_LOOP = 2;
const POINT_ANNOTATION_LINE_STRIP = 3;
const POINT_ANNOTATION_LINE_LIST = 4;

export type DecodedFoxgloveImageAnnotations = {
  timestampNs: number | null;
  overlays: Image2dOverlayPrimitive[];
};

function decodeTimestampNs(
  timestamp:
    | { seconds?: number | null; nanos?: number | null }
    | null
    | undefined
) {
  if (!timestamp) {
    return null;
  }

  return (
    Number(timestamp.seconds ?? 0) * 1_000_000_000 +
    Number(timestamp.nanos ?? 0)
  );
}

function decodePoint(
  point: { x?: number | null; y?: number | null } | null | undefined
): Image2dOverlayPoint {
  return {
    x: Number(point?.x ?? 0),
    y: Number(point?.y ?? 0),
  };
}

function buildPointsAnnotationOverlays(
  annotation: ReturnType<
    typeof decodeFoxgloveImageAnnotationsMessage
  >["points"][number],
  index: number
): Image2dOverlayPrimitive[] {
  const points = (annotation.points ?? []).map(decodePoint);
  const strokeWidth = Math.max(1, Number(annotation.thickness ?? 1));
  const strokeColor = foxgloveColorToCss(
    annotation.outlineColor,
    "rgba(57, 198, 255, 1)"
  );
  const fillColor = foxgloveColorToCss(
    annotation.fillColor,
    "rgba(57, 198, 255, 0.18)"
  );

  if (!points.length) {
    return [];
  }

  if (
    (annotation.type ?? POINT_ANNOTATION_POINTS) === POINT_ANNOTATION_POINTS
  ) {
    return [
      {
        kind: "points",
        id: `points:${index}`,
        points,
        fillColor,
        strokeColor,
        strokeWidth,
        pointRadius: Math.max(2, strokeWidth * 0.75),
      },
    ];
  }

  const mode =
    (annotation.type ?? POINT_ANNOTATION_LINE_STRIP) ===
    POINT_ANNOTATION_LINE_LIST
      ? "line-list"
      : (annotation.type ?? POINT_ANNOTATION_LINE_STRIP) ===
        POINT_ANNOTATION_LINE_LOOP
      ? "line-loop"
      : "line-strip";

  return [
    {
      kind: "polyline",
      id: `polyline:${index}`,
      points,
      closed: mode === "line-loop",
      fillColor,
      strokeColor,
      strokeWidth,
      mode,
    },
  ];
}

export function decodeFoxgloveImageAnnotationsPayload(
  payload: Uint8Array
): DecodedFoxgloveImageAnnotations {
  const message = decodeFoxgloveImageAnnotationsMessage(payload);
  const overlays: Image2dOverlayPrimitive[] = [];
  let timestampNs = decodeTimestampNs(message.timestamp);

  message.circles.forEach((circle, index) => {
    if (timestampNs === null) {
      timestampNs = decodeTimestampNs(circle.timestamp);
    }

    overlays.push({
      kind: "circle",
      id: `circle:${index}`,
      center: decodePoint(circle.position),
      radius: Math.max(0, Number(circle.diameter ?? 0) / 2),
      fillColor: foxgloveColorToCss(
        circle.fillColor,
        "rgba(57, 198, 255, 0.16)"
      ),
      strokeColor: foxgloveColorToCss(
        circle.outlineColor,
        "rgba(57, 198, 255, 1)"
      ),
      strokeWidth: Math.max(1, Number(circle.thickness ?? 1)),
    });
  });

  message.points.forEach((annotation, index) => {
    if (timestampNs === null) {
      timestampNs = decodeTimestampNs(annotation.timestamp);
    }

    overlays.push(...buildPointsAnnotationOverlays(annotation, index));
  });

  message.texts.forEach((text, index) => {
    if (timestampNs === null) {
      timestampNs = decodeTimestampNs(text.timestamp);
    }

    overlays.push({
      kind: "text",
      id: `text:${index}`,
      position: decodePoint(text.position),
      text: text.text ?? "",
      fontSize: Math.max(10, Number(text.fontSize ?? 14)),
      textColor: foxgloveColorToCss(text.textColor, "rgba(255,255,255,1)"),
      backgroundColor: foxgloveColorToCss(
        text.backgroundColor,
        "rgba(11, 18, 29, 0.82)"
      ),
    });
  });

  return {
    timestampNs,
    overlays,
  };
}
