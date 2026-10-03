import type {
  DatasetFactory,
  GroupSliceConfig,
} from "src/shared/dataset-factory";

// Ground truth matches the first 5 samples of the quickstart zoo dataset,
// preserved when migrating away from it (zoo datasets are a bad test pattern:
// slow, network-dependent, and couple tests to external data).
export const QUICKSTART_GROUND_TRUTH = [
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
export const QUICKSTART_PREDICTIONS = [
  ["bear", "bird", "bird"],
  ["backpack", "backpack", "handbag", "horse", "person"],
  ["bed", "cat"],
  ["bottle", "bottle", "chair", "cup"],
  ["cake", "surfboard"],
];

/** Five `validation`-tagged images, `<index>.png`, with the labels above */
export const createQuickstartDataset = (
  datasetFactory: typeof DatasetFactory,
  datasetName: string,
  savedViews?: { [name: string]: string },
) =>
  datasetFactory.createDataset({
    datasetName,
    savedViews,
    numSamples: QUICKSTART_GROUND_TRUTH.length,
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
        ground_truth: detections(QUICKSTART_GROUND_TRUTH[index]),
        predictions: detections(QUICKSTART_PREDICTIONS[index]),
      };
    },
  });

/** The quickstart-groups layout: two image slices and a 3D `pcd` slice */
export const QUICKSTART_GROUP_SLICES: GroupSliceConfig[] = [
  { name: "left", mediaType: "image" },
  { name: "right", mediaType: "image" },
  { name: "pcd", mediaType: "3d" },
];
