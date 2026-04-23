import * as THREE from "three";
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
const IMAGE_ANNOTATION_COLOR_KEY_KEYS = [
  ".label",
  "label",
  ".category",
  "category",
];

type ImageAnnotationMetadataEntry = {
  label: string;
  normalizedLabel: string;
  value: string;
};

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

function decodeMetadataEntries(
  metadata:
    | Array<{ key?: string | null; value?: string | null }>
    | null
    | undefined
) {
  return (metadata ?? [])
    .map((entry) => {
      const label = (entry.key ?? "").trim();
      const value = (entry.value ?? "").trim();
      if (!label || !value) {
        return null;
      }

      return {
        label,
        normalizedLabel: label.toLocaleLowerCase(),
        value,
      };
    })
    .filter((entry): entry is ImageAnnotationMetadataEntry => Boolean(entry));
}

function getMetadataValue(
  entries: ImageAnnotationMetadataEntry[],
  candidateKeys: string[]
) {
  for (const key of candidateKeys) {
    const match = entries.find((entry) => entry.normalizedLabel === key);
    if (match) {
      return match.value;
    }
  }

  return null;
}

function hashString(value: string) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash;
}

function toRgbaString(color: THREE.Color, alpha: number) {
  return `rgba(${Math.round(color.r * 255)}, ${Math.round(
    color.g * 255
  )}, ${Math.round(color.b * 255)}, ${alpha})`;
}

function getImageAnnotationSemanticColors(colorKey: string) {
  const hash = hashString(colorKey);
  const hue = hash % 360;
  const saturation = 68 + (hash % 10);
  const lightness = 58 + ((hash >> 9) % 8);
  const color = new THREE.Color().setHSL(
    hue / 360,
    saturation / 100,
    lightness / 100
  );
  const strokeColor = `#${color.getHexString()}`;

  return {
    strokeColor,
    fillColor: toRgbaString(color, 0.18),
    textColor: "rgba(255,255,255,1)",
    backgroundColor: toRgbaString(color, 0.82),
  };
}

function resolveAnnotationSemanticColors(
  annotationMetadataEntries: ImageAnnotationMetadataEntry[],
  messageMetadataEntries: ImageAnnotationMetadataEntry[]
) {
  const colorKey = getMetadataValue(
    [...annotationMetadataEntries, ...messageMetadataEntries],
    IMAGE_ANNOTATION_COLOR_KEY_KEYS
  );
  if (!colorKey) {
    return null;
  }

  return getImageAnnotationSemanticColors(colorKey);
}

function buildPointsAnnotationOverlays(
  annotation: ReturnType<
    typeof decodeFoxgloveImageAnnotationsMessage
  >["points"][number],
  index: number,
  messageMetadataEntries: ImageAnnotationMetadataEntry[]
): Image2dOverlayPrimitive[] {
  const points = (annotation.points ?? []).map(decodePoint);
  const strokeWidth = Math.max(1, Number(annotation.thickness ?? 1));
  const defaultStrokeColor = foxgloveColorToCss(
    annotation.outlineColor,
    "rgba(57, 198, 255, 1)"
  );
  const defaultFillColor = foxgloveColorToCss(
    annotation.fillColor,
    "rgba(57, 198, 255, 0.18)"
  );
  const semanticColors = resolveAnnotationSemanticColors(
    decodeMetadataEntries(annotation.metadata),
    messageMetadataEntries
  );
  const strokeColor = semanticColors?.strokeColor ?? defaultStrokeColor;
  const fillColor = semanticColors?.fillColor ?? defaultFillColor;

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
  const messageMetadataEntries = decodeMetadataEntries(message.metadata);
  let timestampNs = decodeTimestampNs(message.timestamp);

  message.circles.forEach((circle, index) => {
    if (timestampNs === null) {
      timestampNs = decodeTimestampNs(circle.timestamp);
    }

    const semanticColors = resolveAnnotationSemanticColors(
      decodeMetadataEntries(circle.metadata),
      messageMetadataEntries
    );
    overlays.push({
      kind: "circle",
      id: `circle:${index}`,
      center: decodePoint(circle.position),
      radius: Math.max(0, Number(circle.diameter ?? 0) / 2),
      fillColor:
        semanticColors?.fillColor ??
        foxgloveColorToCss(circle.fillColor, "rgba(57, 198, 255, 0.16)"),
      strokeColor:
        semanticColors?.strokeColor ??
        foxgloveColorToCss(circle.outlineColor, "rgba(57, 198, 255, 1)"),
      strokeWidth: Math.max(1, Number(circle.thickness ?? 1)),
    });
  });

  message.points.forEach((annotation, index) => {
    if (timestampNs === null) {
      timestampNs = decodeTimestampNs(annotation.timestamp);
    }

    overlays.push(
      ...buildPointsAnnotationOverlays(
        annotation,
        index,
        messageMetadataEntries
      )
    );
  });

  message.texts.forEach((text, index) => {
    if (timestampNs === null) {
      timestampNs = decodeTimestampNs(text.timestamp);
    }

    const semanticColors = resolveAnnotationSemanticColors(
      decodeMetadataEntries(text.metadata),
      messageMetadataEntries
    );
    overlays.push({
      kind: "text",
      id: `text:${index}`,
      position: decodePoint(text.position),
      text: text.text ?? "",
      fontSize: Math.max(10, Number(text.fontSize ?? 14)),
      textColor:
        semanticColors?.textColor ??
        foxgloveColorToCss(text.textColor, "rgba(255,255,255,1)"),
      backgroundColor:
        semanticColors?.backgroundColor ??
        foxgloveColorToCss(text.backgroundColor, "rgba(11, 18, 29, 0.82)"),
    });
  });

  return {
    timestampNs,
    overlays,
  };
}
