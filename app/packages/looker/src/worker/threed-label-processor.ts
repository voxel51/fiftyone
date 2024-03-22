import { DETECTIONS, getCls, Schema } from "@fiftyone/utilities";
import { POINTCLOUD_OVERLAY_PADDING } from "../constants";
import { DetectionLabel } from "../overlays/detection";
import { OrthogrpahicProjectionMetadata, Sample } from "../state";
import { mapId } from "./shared";

type DetectionsLabel = {
  detections: DetectionLabel[];
};

type ThreeDLabel = DetectionsLabel | DetectionLabel;

type LabelId = string;

const COLLECTION_TYPES = new Set(["Detections"]);

const scalingFactorCache: Record<
  LabelId,
  {
    scalingFactor?: { xScale: number; yScale: number };
  }
> = {};

/**
 * Get scaling parameters from pointcloud bound range.
 *
 * Cache results of this function because it is called for every label in a sample.
 */
const getScalingFactorForLabel = (
  labelId: LabelId,
  width: number,
  height: number,
  xmin: number,
  xmax: number,
  ymin: number,
  ymax: number
) => {
  if (scalingFactorCache[labelId]?.scalingFactor) {
    return scalingFactorCache[labelId].scalingFactor;
  }

  if (!scalingFactorCache[labelId]) {
    scalingFactorCache[labelId] = {};
  }

  scalingFactorCache[labelId].scalingFactor = {
    xScale: width / (xmax - xmin),
    yScale: height / (ymax - ymin),
  };

  return scalingFactorCache[labelId].scalingFactor;
};

// cache between sample id and inferred projection params
const inferredParamsCache: Record<
  Sample["id"],
  OrthogrpahicProjectionMetadata
> = {};

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
    min_bound: [
      minX === Infinity
        ? -POINTCLOUD_OVERLAY_PADDING
        : minX - POINTCLOUD_OVERLAY_PADDING,
      minY === Infinity
        ? -POINTCLOUD_OVERLAY_PADDING
        : minY - POINTCLOUD_OVERLAY_PADDING,
    ],
    max_bound: [
      maxX === Infinity
        ? POINTCLOUD_OVERLAY_PADDING
        : maxX + POINTCLOUD_OVERLAY_PADDING,
      maxY === Infinity
        ? POINTCLOUD_OVERLAY_PADDING
        : maxY + POINTCLOUD_OVERLAY_PADDING,
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
    const {
      width: canvasWidth,
      height: canvasHeight,
      min_bound,
      max_bound,
    } = orthographicProjectionParams;
    const [xmin, ymin] = min_bound;
    const [xmax, ymax] = max_bound;

    const [x, y, z] = label.location; // centroid of bounding box
    const [lx, ly, lz] = label.dimensions; // length of bounding box in each dimension

    const { xScale, yScale } = getScalingFactorForLabel(
      label._id,
      canvasWidth,
      canvasHeight,
      xmin,
      xmax,
      ymin,
      ymax
    );

    const tlx = (xScale * (x - lx / 2 - xmin)) / canvasWidth; // top left x, normalized to [0, 1]
    const tly = (yScale * (-y - ly / 2 + ymax)) / canvasHeight; // top left y, normalized to [0, 1]

    const boxWidth = (lx * xScale) / canvasWidth; // width of projected bounding box, normalized to [0, 1]
    const boxHeight = (ly * yScale) / canvasHeight; // height of projected bounding box, normalized to [0, 1]

    label.bounding_box = [tlx, tly, boxWidth, boxHeight];
  },
});

const VALID_THREE_D_LABELS = new Set(["Detections", "Detection"]);

export const process3DLabels = async (schema: Schema, sample: Sample) => {
  const orthographicProjectionField = Object.entries(schema)
    .find(([_, d]) =>
      d.embeddedDocType?.endsWith(".OrthographicProjectionMetadata")
    )
    ?.at(0)[0];

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
