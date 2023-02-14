import { DetectionLabel } from "../overlays/detection";
import { Sample } from "../state";
import { mapId } from "./shared";

type DetectionsLabel = {
  _cls: "Detections";
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

const PainterFactory3D = (
  orthographicProjectionParams: Sample["orthographic_projection_metadata"]
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

    const tlx = (xScale * (x - lx / 2 + (xmax - xmin) / 2)) / canvasWidth; // top left x, normalized to [0, 1]
    const tly = (yScale * (-y - ly / 2 + (ymax - ymin) / 2)) / canvasHeight; // top left y, normalized to [0, 1]

    const boxWidth = (lx * xScale) / canvasWidth; // width of projected bounding box, normalized to [0, 1]
    const boxHeight = (ly * yScale) / canvasHeight; // height of projected bounding box, normalized to [0, 1]

    label.bounding_box = [tlx, tly, boxWidth, boxHeight];
  },
});

const VALID_THREE_D_LABELS = new Set(["Detections", "Detection"]);

export const process3DLabels = async (sample: Sample) => {
  if (!sample.orthographic_projection_metadata) {
    // todo
    return;
  }

  const painterFactory = PainterFactory3D(
    sample.orthographic_projection_metadata
  );

  const paintJobPromises = [];

  for (const field in sample) {
    const label = sample[field] as ThreeDLabel;

    if (
      !label ||
      typeof label !== "object" ||
      !VALID_THREE_D_LABELS.has(label._cls)
    ) {
      continue;
    }

    if (COLLECTION_TYPES.has(label._cls)) {
      label[label._cls.toLocaleLowerCase()].forEach((label: ThreeDLabel) => {
        mapId(label);
      });
    } else {
      mapId(label);
    }

    switch (label._cls) {
      case "Detections":
        paintJobPromises.push(painterFactory.Detections(label));
        break;
      case "Detection":
        paintJobPromises.push(painterFactory.Detection(label));
        break;
      default:
        throw new Error("Invalid label type");
    }
  }
};
