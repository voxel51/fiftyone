import { DETECTIONS, getCls, Schema } from "@fiftyone/utilities";
import { POINTCLOUD_OVERLAY_PADDING } from "../constants";
import { DetectionLabel } from "../overlays/detection";
import { OrthogrpahicProjectionMetadata, Sample } from "../state";
import {
  BoundingBox3D,
  getProjectedCorners,
  calculateBoundingBoxProjectionAndConvexHull,
} from "./label-3d-projection-utils";
import { mapId } from "./shared";

type DetectionsLabel = {
  detections: DetectionLabel[];
};

type ThreeDLabel = DetectionsLabel | DetectionLabel;

const COLLECTION_TYPES = new Set(["Detections"]);

// cache between sample id and inferred projection params
const inferredParamsCache: Record<
  Sample["id"],
  OrthogrpahicProjectionMetadata
> = {};

const remap = (
  value: number,
  fromLow: number,
  fromHigh: number,
  toLow: number,
  toHigh: number
) => {
  return toLow + ((value - fromLow) * (toHigh - toLow)) / (fromHigh - fromLow);
};

/**
 * Use label attributes to infer width, height, and bounds.
 */
const getInferredParamsForUndefinedProjection = (
  schema: Schema,
  sample: Readonly<Sample>
) => {
  if (inferredParamsCache[sample.id]) {
    return inferredParamsCache[sample.id];
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const [field, label] of Object.entries(sample)) {
    const cls = getCls(field, schema);
    if (typeof label !== "object" || !cls) {
      continue; // skip non-labels like "filepath", "id"
    }

    if (cls === DETECTIONS) {
      for (const detection of label.detections as DetectionLabel[]) {
        const [x, y] = detection.location;
        const [lx, ly] = detection.dimensions;

        minX = Math.min(minX, x - lx / 2);
        maxX = Math.max(maxX, x + lx / 2);
        minY = Math.min(minY, y - ly / 2);
        maxY = Math.max(maxY, y + ly / 2);
      }
    } else if (cls === "Detection") {
      const [x, y] = label.location as DetectionLabel["location"];
      const [lx, ly] = label.dimensions as DetectionLabel["dimensions"];

      minX = Math.min(minX, x - lx / 2);
      maxX = Math.max(maxX, x + lx / 2);
      minY = Math.min(minY, y - ly / 2);
      maxY = Math.max(maxY, y + ly / 2);
    }
  }

  inferredParamsCache[sample.id] = {
    width: minX === Infinity ? 512 : maxX - minX + POINTCLOUD_OVERLAY_PADDING,
    height: minY === Infinity ? 512 : maxY - minY + POINTCLOUD_OVERLAY_PADDING,
    normal: [0, 0, 1],
    min_bound: [
      minX === Infinity
        ? -POINTCLOUD_OVERLAY_PADDING
        : minX - POINTCLOUD_OVERLAY_PADDING,
      minY === Infinity
        ? -POINTCLOUD_OVERLAY_PADDING
        : minY - POINTCLOUD_OVERLAY_PADDING,
      0,
    ],
    max_bound: [
      maxX === Infinity
        ? POINTCLOUD_OVERLAY_PADDING
        : maxX + POINTCLOUD_OVERLAY_PADDING,
      maxY === Infinity
        ? POINTCLOUD_OVERLAY_PADDING
        : maxY + POINTCLOUD_OVERLAY_PADDING,
      0,
    ],
  } as OrthogrpahicProjectionMetadata;

  return inferredParamsCache[sample.id];
};

const PainterFactory3D = (
  orthographicProjectionParams: OrthogrpahicProjectionMetadata
) => ({
  /**
   * Map over each detection label in the list impute bounding boxes parameters.
   */
  Detections: (label: DetectionsLabel) => {
    label.detections.map((label) =>
      PainterFactory3D(orthographicProjectionParams).Detection(label)
    );
  },
  /**
   * Impute bounding box parameters.
   */
  Detection: (label: DetectionLabel) => {
    label.convexHull = calculateBoundingBoxProjectionAndConvexHull(
      orthographicProjectionParams,
      label
    );
  },
});

const VALID_THREE_D_LABELS = new Set(["Detections", "Detection"]);

export const process3DLabels = async (schema: Schema, sample: Sample) => {
  const orthographicProjectionField = Object.entries(schema)
    .find(([_, d]) =>
      d.embeddedDocType?.endsWith(".OrthographicProjectionMetadata")
    )
    ?.at(0) as string;

  const painterFactory = PainterFactory3D(
    orthographicProjectionField
      ? (sample[orthographicProjectionField] as OrthogrpahicProjectionMetadata)
      : getInferredParamsForUndefinedProjection(schema, sample)
  );

  const paintJobPromises = [];

  for (const field in sample) {
    const label = sample[field] as ThreeDLabel;
    const cls = getCls(field, schema);

    if (!label || typeof label !== "object" || !VALID_THREE_D_LABELS.has(cls)) {
      continue;
    }

    if (COLLECTION_TYPES.has(cls)) {
      label[cls.toLocaleLowerCase()].forEach((label: ThreeDLabel) => {
        mapId(label);
      });
    } else {
      mapId(label);
    }

    switch (cls) {
      case "Detections":
        paintJobPromises.push(
          painterFactory.Detections(label as DetectionsLabel)
        );
        break;
      case "Detection":
        paintJobPromises.push(
          painterFactory.Detection(label as DetectionLabel)
        );
        break;
      default:
        throw new Error("Invalid label type");
    }
  }
};
