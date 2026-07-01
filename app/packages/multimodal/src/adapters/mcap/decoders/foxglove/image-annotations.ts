import {
  type DecodedAttributeValue,
  type Decoder,
  type ImageAnnotationCircle,
  type ImageAnnotationPoints,
  type ImageAnnotationPointsKind,
  type ImageAnnotationText,
  type ImageAnnotationsVisualization,
  type RgbaColor,
} from "../../../../decoders";
import { VISUALIZATION_KIND } from "../../../../visualization";
import { decodeProtobufMessage } from "./protobuf";
import { FOXGLOVE_IMAGE_ANNOTATIONS_PAYLOAD } from "./protobuf/payloads";
import { asRecord, optionalRecord } from "./protobuf/records";
import { timingFromContext, timestampNs } from "./protobuf/timing";

const POINTS_KIND_BY_ENUM: Readonly<Record<number, ImageAnnotationPointsKind>> =
  {
    1: "points",
    2: "line-loop",
    3: "line-strip",
    4: "line-list",
  };

const POINTS_KIND_BY_STRING: Readonly<
  Record<string, ImageAnnotationPointsKind>
> = {
  POINTS: "points",
  LINE_LOOP: "line-loop",
  LINE_STRIP: "line-strip",
  LINE_LIST: "line-list",
};

/**
 * Decoder for Foxglove ImageAnnotations protobuf messages.
 */
export const foxgloveImageAnnotationsDecoder: Decoder = {
  id: "foxglove.image-annotations",
  payload: FOXGLOVE_IMAGE_ANNOTATIONS_PAYLOAD,
  version: "1",

  decode(bytes, context) {
    const message = decodeProtobufMessage(
      bytes,
      FOXGLOVE_IMAGE_ANNOTATIONS_PAYLOAD,
      context,
    );

    const rawCircles = optionalArray(message, "circles");
    const rawPoints = optionalArray(message, "points");
    const rawTexts = optionalArray(message, "texts");

    const circles = rawCircles.map(decodeCircle);
    const points = rawPoints.map(decodePoints);
    const texts = rawTexts.map(decodeText);

    // Per Foxglove schema: top-level timestamp overrides individual annotation timestamps.
    const topLevelTs = optionalRecord(message, "timestamp");
    const messageTimestamp = topLevelTs
      ? timestampNs(topLevelTs)
      : firstAnnotationTimestamp(rawCircles, rawPoints, rawTexts);

    const visualization: ImageAnnotationsVisualization = {
      kind: VISUALIZATION_KIND.IMAGE_ANNOTATIONS,
      circles,
      points,
      texts,
    };

    const attributes: Record<string, DecodedAttributeValue> = {
      circleCount: circles.length,
      pointGroupCount: points.length,
      textCount: texts.length,
    };

    return {
      attributes,
      resourceHints: { sizeBytes: bytes.byteLength },
      timing: timingFromContext(context, messageTimestamp),
      visualization,
    };
  },
};

function decodeCircle(value: unknown): ImageAnnotationCircle {
  const record = asRecord(value);
  return {
    position: decodePoint(optionalRecord(record, "position")),
    diameter: numberField(record, "diameter"),
    thickness: numberField(record, "thickness"),
    outlineColor: decodeColor(
      optionalRecord(record, "outlineColor", "outline_color"),
    ),
    fillColor: decodeColor(optionalRecord(record, "fillColor", "fill_color")),
  };
}

function decodePoints(value: unknown): ImageAnnotationPoints {
  const record = asRecord(value);
  const rawPoints = optionalArray(record, "points");
  return {
    type: decodePointsKind(record["type"]),
    points: rawPoints.map((p) => decodePoint(asRecord(p))),
    thickness: numberField(record, "thickness"),
    outlineColor: decodeColor(
      optionalRecord(record, "outlineColor", "outline_color"),
    ),
    outlineColors: optionalArray(record, "outlineColors", "outline_colors")
      .map((c) => decodeColor(asRecord(c)))
      .filter((c): c is RgbaColor => c !== null),
    fillColor: decodeColor(optionalRecord(record, "fillColor", "fill_color")),
  };
}

function decodeText(value: unknown): ImageAnnotationText {
  const record = asRecord(value);
  return {
    position: decodePoint(optionalRecord(record, "position")),
    text: stringField(record, "text"),
    fontSize: numberField(record, "fontSize", "font_size"),
    textColor: decodeColor(optionalRecord(record, "textColor", "text_color")),
    backgroundColor: decodeColor(
      optionalRecord(record, "backgroundColor", "background_color"),
    ),
  };
}

function decodePoint(
  record: Record<string, unknown> | undefined,
): readonly [number, number] {
  if (!record) return [0, 0];
  return [numberField(record, "x"), numberField(record, "y")];
}

function decodeColor(
  record: Record<string, unknown> | undefined,
): RgbaColor | null {
  if (!record) return null;
  return [
    numberField(record, "r"),
    numberField(record, "g"),
    numberField(record, "b"),
    numberField(record, "a"),
  ];
}

function decodePointsKind(value: unknown): ImageAnnotationPointsKind {
  if (typeof value === "number") {
    return POINTS_KIND_BY_ENUM[value] ?? "points";
  }
  if (typeof value === "string") {
    return POINTS_KIND_BY_STRING[value] ?? "points";
  }
  return "points";
}

function optionalArray(
  record: Record<string, unknown>,
  field: string,
  fallbackField?: string,
): readonly unknown[] {
  const value =
    record[field] ?? (fallbackField ? record[fallbackField] : undefined);
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new Error(`Field '${field}' is not an array`);
  }
  return value;
}

function numberField(
  record: Record<string, unknown>,
  field: string,
  fallbackField?: string,
): number {
  const value =
    record[field] ?? (fallbackField ? record[fallbackField] : undefined);
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  return 0;
}

function stringField(record: Record<string, unknown>, field: string): string {
  const value = record[field];
  return typeof value === "string" ? value : "";
}

function firstAnnotationTimestamp(
  ...groups: readonly (readonly unknown[])[]
): bigint | undefined {
  for (const group of groups) {
    for (const entry of group) {
      if (!entry || typeof entry !== "object") continue;
      const ts = (entry as Record<string, unknown>)["timestamp"];
      if (ts && typeof ts === "object") {
        const ns = timestampNs(ts as Record<string, unknown>);
        if (ns !== undefined) return ns;
      }
    }
  }
  return undefined;
}
