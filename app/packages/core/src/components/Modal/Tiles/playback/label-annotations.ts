import {
  VISUALIZATION_KIND,
  type ImageAnnotationCircle,
  type ImageAnnotationPoints,
  type ImageAnnotationText,
  type ImageAnnotationsVisualization,
  type RgbaColor,
} from "@fiftyone/multimodal/sequence";
import { getColor, hexToRgb } from "@fiftyone/utilities";

/** Label classes drawn on a played-back image; everything else is skipped. */
export const DRAWABLE_LABEL_CLASSES: ReadonlySet<string> = new Set([
  "Classification",
  "Classifications",
  "Detection",
  "Detections",
  "Keypoint",
  "Keypoints",
  "Polyline",
  "Polylines",
]);

export interface LabelColoring {
  readonly byField: boolean;
  readonly pool: readonly string[];
  readonly seed: number;
}

interface LabelDoc {
  readonly _cls?: string;
  readonly label?: string | null;
  readonly bounding_box?: readonly number[] | null;
  readonly points?: readonly (readonly number[])[] | readonly number[][][];
  readonly closed?: boolean;
  readonly filled?: boolean;
}

const LINE_THICKNESS = 2;
const KEYPOINT_DIAMETER = 6;
const TEXT_SIZE = 14;
const TEXT_BACKGROUND: RgbaColor = [0, 0, 0, 0.6];
const WHITE: RgbaColor = [1, 1, 1, 1];

/**
 * Converts one FiftyOne label field into pixel-space image annotations.
 * Coordinates in FiftyOne are relative to the image, so the image size is
 * needed; masks, heatmaps and segmentations are not drawn.
 */
export function labelFieldAnnotations(
  value: unknown,
  field: string,
  width: number,
  height: number,
  coloring: LabelColoring,
): ImageAnnotationsVisualization | null {
  const labels = expandLabels(value);
  if (labels.length === 0) return null;

  const points: ImageAnnotationPoints[] = [];
  const circles: ImageAnnotationCircle[] = [];
  const texts: ImageAnnotationText[] = [];
  let classificationRow = 0;

  for (const label of labels) {
    const color = colorFor(coloring, field, label.label ?? null);
    switch (label._cls) {
      case "Detection": {
        const box = label.bounding_box;
        if (!box || box.length < 4) break;
        const [x, y, w, h] = box;
        const left = x * width;
        const top = y * height;
        const right = (x + w) * width;
        const bottom = (y + h) * height;
        points.push(
          lineLoop(
            [
              [left, top],
              [right, top],
              [right, bottom],
              [left, bottom],
            ],
            color,
            false,
          ),
        );
        if (label.label) {
          texts.push(text(label.label, [left, Math.max(0, top - TEXT_SIZE)]));
        }
        break;
      }
      case "Polyline": {
        const shapes = (label.points ?? []) as readonly (readonly number[])[][];
        for (const shape of shapes) {
          const pixels = shape
            .filter((point) => point.length >= 2)
            .map(([px, py]) => [px * width, py * height] as [number, number]);
          if (pixels.length < 2) continue;
          points.push(
            label.closed || label.filled
              ? lineLoop(pixels, color, label.filled === true)
              : {
                  fillColor: null,
                  outlineColor: color,
                  outlineColors: [],
                  points: pixels,
                  thickness: LINE_THICKNESS,
                  type: "line-strip",
                },
          );
        }
        break;
      }
      case "Keypoint": {
        const keypoints = (label.points ??
          []) as readonly (readonly number[])[];
        for (const point of keypoints) {
          const [px, py] = point;
          if (!Number.isFinite(px) || !Number.isFinite(py)) continue;
          circles.push({
            diameter: KEYPOINT_DIAMETER,
            fillColor: color,
            outlineColor: null,
            position: [px * width, py * height],
            thickness: 0,
          });
        }
        break;
      }
      case "Classification": {
        if (!label.label) break;
        texts.push(
          text(`${field}: ${label.label}`, [
            4,
            4 + classificationRow * (TEXT_SIZE + 4),
          ]),
        );
        classificationRow += 1;
        break;
      }
      default:
        break;
    }
  }

  if (points.length === 0 && circles.length === 0 && texts.length === 0) {
    return null;
  }
  return {
    circles,
    kind: VISUALIZATION_KIND.IMAGE_ANNOTATIONS,
    points,
    texts,
  };
}

/** Flattens list containers (`Detections` etc.) into their members. */
function expandLabels(value: unknown): LabelDoc[] {
  if (!value || typeof value !== "object") return [];
  const doc = value as Record<string, unknown> & LabelDoc;
  switch (doc._cls) {
    case "Detections":
      return asDocs(doc.detections);
    case "Polylines":
      return asDocs(doc.polylines);
    case "Keypoints":
      return asDocs(doc.keypoints);
    case "Classifications":
      return asDocs(doc.classifications);
    case "Detection":
    case "Polyline":
    case "Keypoint":
    case "Classification":
      return [doc];
    default:
      return [];
  }
}

function asDocs(value: unknown): LabelDoc[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is LabelDoc => Boolean(item) && typeof item === "object",
      )
    : [];
}

function colorFor(
  coloring: LabelColoring,
  field: string,
  label: string | null,
): RgbaColor {
  const hex = getColor(
    coloring.pool,
    coloring.seed,
    coloring.byField ? field : label,
  );
  const rgb = hexToRgb(hex);
  return rgb ? [rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, 1] : WHITE;
}

function lineLoop(
  pixels: readonly (readonly [number, number])[],
  color: RgbaColor,
  filled: boolean,
): ImageAnnotationPoints {
  return {
    fillColor: filled ? [color[0], color[1], color[2], 0.3] : null,
    outlineColor: color,
    outlineColors: [],
    points: pixels,
    thickness: LINE_THICKNESS,
    type: "line-loop",
  };
}

function text(
  value: string,
  position: readonly [number, number],
): ImageAnnotationText {
  return {
    backgroundColor: TEXT_BACKGROUND,
    fontSize: TEXT_SIZE,
    position,
    text: value,
    textColor: WHITE,
  };
}
