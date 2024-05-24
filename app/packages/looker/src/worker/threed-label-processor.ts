import { DETECTIONS, getCls, Schema } from "@fiftyone/utilities";
import ch from "monotone-convex-hull-2d";
import { POINTCLOUD_OVERLAY_PADDING } from "../constants";
import { DetectionLabel } from "../overlays/detection";
import { OrthogrpahicProjectionMetadata, Sample } from "../state";
import { BoundingBox3D, getBoundingBox2D } from "./label-3d-projection-utils";
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
const getScalingFactorForLabel = ({
  labelId,
  normal,
  width,
  height,
  xmin,
  xmax,
  ymin,
  ymax,
  zmin,
  zmax,
}: {
  labelId: LabelId;
  normal: [number, number, number];
  width: number;
  height: number;
  xmin: number;
  xmax: number;
  ymin: number;
  ymax: number;
  zmin: number;
  zmax: number;
}) => {
  if (scalingFactorCache[labelId]?.scalingFactor) {
    return scalingFactorCache[labelId].scalingFactor;
  }

  if (!scalingFactorCache[labelId]) {
    scalingFactorCache[labelId] = {};
  }

  const [nx, ny, nz] = normal;

  let projectionPlane1Normalizer = 0;
  let projectionPlane2Normalizer = 0;

  if (nx === 1 || nx === -1) {
    // project on yz plane
    projectionPlane1Normalizer = xmax - xmin;
    projectionPlane2Normalizer = ymax - ymin;
  } else if (ny === 1 || ny === -1) {
    // project on xz plane
    projectionPlane1Normalizer = ymax - ymin;
    projectionPlane2Normalizer = zmax - zmin;
  } else if (nz === 1 || nz === -1) {
    // project on xy plane
    projectionPlane1Normalizer = xmax - xmin;
    projectionPlane2Normalizer = ymax - ymin;
  }

  scalingFactorCache[labelId].scalingFactor = {
    xScale: width / projectionPlane1Normalizer,
    yScale: height / projectionPlane2Normalizer,
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
    const { min_bound, max_bound, normal } = orthographicProjectionParams;
    const [xmin, ymin, zmin] = min_bound;
    const [xmax, ymax, zmax] = max_bound;

    const [lx, ly, lz] = label.location; // centroid of bounding box
    const [dx, dy, dz] = label.dimensions; // length of bounding box in each dimension
    const [rx, ry, rz] = label.rotation ?? [0, 0, 0]; // rotation of bounding box

    const [nx, ny, nz] = normal;

    const box: BoundingBox3D = {
      dimensions: [dx, dy, dz],
      location: [lx, ly, lz],
      rotation: [rx, ry, rz],
    };

    let projectionPlane: "xy" | "xz" | "yz" = "xy";

    if (nx === 1 || nx === -1) {
      // project on yz plane
      projectionPlane = "yz";
    } else if (ny === 1 || ny === -1) {
      // project on xz plane
      projectionPlane = "xz";
    } else if (nz === 1 || nz === -1) {
      // project on xy plane
      projectionPlane = "xy";
    }

    let { tlx, tly, width, height, projectedCorners } = getBoundingBox2D(
      box,
      projectionPlane
    );

    tlx = (tlx - xmin) / (xmax - xmin);
    tly = (tly + ymax) / (ymax - ymin);

    width = width / (xmax - xmin);
    height = height / (ymax - ymin);

    label.bounding_box = [tlx, tly, width, height];

    // map projected corners
    const newProjectedCorners = projectedCorners.map(([x, y]) => {
      const px = (x - xmin) / (xmax - xmin);
      const py = (ymax - y) / (ymax - ymin);
      return [px, py];
    });

    const convexHullIndices = ch(newProjectedCorners);

    const convexHull = convexHullIndices.map((i) => newProjectedCorners[i]);

    // sort convex hull points in clockwise order

    label.convexHull = convexHull;
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
