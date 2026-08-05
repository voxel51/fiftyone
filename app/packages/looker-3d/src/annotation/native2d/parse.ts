import {
  DETECTION,
  DETECTIONS,
  POLYLINE,
  POLYLINES,
} from "@fiftyone/utilities";
import type { Native2dLabel } from "./types";

/**
 * Extracts an ObjectId string from a serialized value. The REST group endpoint
 * serializes nested ids as extended JSON (`{ $oid: "..." }`) while top-level
 * ids are normalized to plain strings, so handle both.
 */
const oid = (value: unknown): string | undefined => {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "$oid" in value) {
    const raw = (value as { $oid?: unknown }).$oid;
    return typeof raw === "string" ? raw : undefined;
  }
  return undefined;
};

const detectionFrom = (
  raw: Record<string, any>,
  path: string,
): Native2dLabel | null => {
  const _id = oid(raw?._id) ?? oid(raw?.id);
  const bbox = raw?.bounding_box;
  if (!_id || !Array.isArray(bbox) || bbox.length < 4) return null;
  return {
    _id,
    _cls: "Detection",
    path,
    label: raw.label,
    boundingBox: [bbox[0], bbox[1], bbox[2], bbox[3]],
  };
};

const polylineFrom = (
  raw: Record<string, any>,
  path: string,
): Native2dLabel | null => {
  const _id = oid(raw?._id) ?? oid(raw?.id);
  if (!_id || !Array.isArray(raw?.points)) return null;
  return {
    _id,
    _cls: "Polyline",
    path,
    label: raw.label,
    points: raw.points as [number, number][][],
    closed: raw.closed,
    filled: raw.filled,
  };
};

/**
 * Flattens the serialized 2D label fields of a single image-slice sample into a
 * list of normalized {@link Native2dLabel}s ready for SVG rendering.
 *
 * Discovery is driven by the payload's own `_cls` tags rather than by a list of
 * schema paths. The schema route was fragile here: a field that only exists on
 * the image slices doesn't necessarily appear in the group's active-slice sample
 * schema, so schema-derived paths came back empty and nothing was ever parsed.
 * The response already says what each field is, so trust that.
 *
 * @param sliceData - the serialized slice sample (field name -> value)
 * @param labelPaths - optional restriction to specific field paths; when
 *   omitted every top-level field is considered.
 */
export const extractNative2dLabels = (
  sliceData: Record<string, any> | undefined | null,
  labelPaths?: string[],
): Native2dLabel[] => {
  if (!sliceData) return [];

  const paths =
    labelPaths && labelPaths.length > 0 ? labelPaths : Object.keys(sliceData);

  const out: Native2dLabel[] = [];

  for (const path of paths) {
    if (path.startsWith("_") || path === "filepath" || path === "id") continue;

    const value = sliceData[path];
    if (!value || typeof value !== "object") continue;

    switch (value._cls) {
      case DETECTIONS:
        if (Array.isArray(value.detections)) {
          for (const d of value.detections) {
            const label = detectionFrom(d, path);
            if (label) out.push(label);
          }
        }
        break;
      case DETECTION: {
        const label = detectionFrom(value, path);
        if (label) out.push(label);
        break;
      }
      case POLYLINES:
        if (Array.isArray(value.polylines)) {
          for (const p of value.polylines) {
            const label = polylineFrom(p, path);
            if (label) out.push(label);
          }
        }
        break;
      case POLYLINE: {
        const label = polylineFrom(value, path);
        if (label) out.push(label);
        break;
      }
      default:
        break;
    }
  }

  return out;
};
