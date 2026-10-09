import type {
  DatasetFactory,
  GroupSliceConfig,
} from "src/shared/dataset-factory";

// Five images of detections; each sample's ground truth + predictions total
// differs, so per-sample counts tell samples apart.
export const GROUND_TRUTH_DETECTIONS = [
  ["bird", "bird", "bird"],
  ["horse", "person"],
  ["carrot", "cat"],
  [
    "bottle",
    "bottle",
    "bottle",
    "chair",
    "cup",
    "cup",
    "dining table",
    "fork",
    "fork",
    "knife",
    "knife",
  ],
  ["cake", "surfboard", "surfboard"],
];

// 16 predictions over 13 distinct labels; each sample's label count (ground
// truth + predictions) is distinct: 6, 7, 4, 15, 5
export const PREDICTION_DETECTIONS = [
  ["bear", "bird", "bird"],
  ["backpack", "backpack", "handbag", "horse", "person"],
  ["bed", "cat"],
  ["bottle", "bottle", "chair", "cup"],
  ["cake", "surfboard"],
];

/** Five `validation`-tagged images, `<index>.png`, with the labels above */
export const createDetectionsDataset = (
  datasetFactory: typeof DatasetFactory,
  datasetName: string,
  savedViews?: { [name: string]: string },
) =>
  datasetFactory.createDataset({
    datasetName,
    savedViews,
    numSamples: GROUND_TRUTH_DETECTIONS.length,
    schema: { ground_truth: "Detections", predictions: "Detections" },
    withSampleData: ({ index }, { label }) => {
      const detections = (labels: string[]) =>
        label.detections(
          labels.map((value, i) =>
            label.detection({
              label: value,
              bounding_box: [0.05 * i, 0.05 * i, 0.3, 0.3],
            }),
          ),
        );
      return {
        tags: ["validation"],
        ground_truth: detections(GROUND_TRUTH_DETECTIONS[index]),
        predictions: detections(PREDICTION_DETECTIONS[index]),
      };
    },
  });

/** Two image slices and a 3D `pcd` slice */
export const GROUP_SLICES: GroupSliceConfig[] = [
  { name: "left", mediaType: "image" },
  { name: "right", mediaType: "image" },
  { name: "pcd", mediaType: "3d" },
];
