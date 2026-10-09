/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Planted fixtures for the embeddings panel specs. Points are precomputed, so
 * every sample lands exactly where these helpers put it and a lasso over a
 * region of the canvas selects a known set.
 */
import type {
  GroupDatasetOptions,
  ImageDatasetOptions,
  LabelBuilders,
} from "src/shared/dataset-factory";
import type { RelativeRect } from "src/oss/poms/panels/embeddings-v2-panel";

export type ImageSeed = Omit<ImageDatasetOptions, "datasetName">;
export type GroupSeed = Omit<GroupDatasetOptions, "datasetName">;

export const BRAIN_KEY = "viz";

/** Samples in the left cluster, labeled `cluster: "a"` */
export const CLUSTER_A = 25;

/** Samples in the right cluster, labeled `cluster: "b"` */
export const CLUSTER_B = 15;

export const TOTAL = CLUSTER_A + CLUSTER_B;

/*
 * Two blobs about 18 units apart and under 5 tall: a wide cloud. The camera
 * fits the cloud's width to the canvas, so the left blob lands in the
 * canvas's left half and the right blob in its right half, in a band around
 * the middle, at any panel size that is not several times taller than wide.
 */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/** A fixed 0..1 value per integer: jitter that never changes between runs */
const hash = (n: number): number => {
  const s = Math.sin(n * 12.9898) * 43758.5453;
  return s - Math.floor(s);
};

/**
 * The `offset`-th point of a blob centered at (`cx`, 0): a sunflower spiral
 * (even density, no grid lines) plus a little jitter, so the cluster reads
 * like real embeddings yet lands identically every run. Bigger clusters
 * grow bigger blobs.
 */
const blobPoint = (offset: number, cx: number, seed: number): number[] => {
  const r = 0.45 * Math.sqrt(offset + 0.5);
  const theta = offset * GOLDEN_ANGLE;
  const jitterX = (hash(seed * 1000 + offset) - 0.5) * 0.3;
  const jitterY = (hash(seed * 1000 + offset + 500) - 0.5) * 0.3;
  return [cx + r * Math.cos(theta) + jitterX, r * Math.sin(theta) + jitterY];
};

/** The first `leftCount` indices form the left blob, the rest the right */
export const clusterPoint = (index: number, leftCount: number): number[] =>
  index < leftCount
    ? blobPoint(index, -9, 1)
    : blobPoint(index - leftCount, 9, 2);

export const plantedPoint = (index: number): number[] =>
  clusterPoint(index, CLUSTER_A);

/** 40 images in two clusters, with one visualization run over them */
export const twoClusters = {
  numSamples: TOTAL,
  // `score` is a float, so coloring by it draws a continuous legend
  schema: { cluster: "StringField", score: "FloatField" },
  withSampleData: ({ index }) => ({
    cluster: index < CLUSTER_A ? "a" : "b",
    // never a whole number, so every value inserts as a float, not an int
    score: index + 0.5,
  }),
  visualizations: [{ brainKey: BRAIN_KEY, points: plantedPoint }],
} satisfies ImageSeed;

/**
 * The canvas's left half, clear of the overlays pinned to its top-left and
 * bottom-left corners. Encloses all of cluster `a` and none of `b`.
 */
export const LEFT_HALF: RelativeRect = { x1: 0.01, y1: 0.2, x2: 0.48, y2: 0.8 };

/** The canvas's right half: all of cluster `b` (indices 25+) and none of `a` */
export const RIGHT_HALF: RelativeRect = {
  x1: 0.52,
  y1: 0.2,
  x2: 0.99,
  y2: 0.8,
};

/**
 * A spot on the canvas far from every point and every overlay (the legend
 * floats top-right; the hint and counter sit in the left corners)
 */
export const EMPTY_AREA = { x: 0.5, y: 0.88 };

/**
 * Three points on a line through the origin. The camera centers the cloud,
 * so the middle sample (index 1, media `1.png`) sits at the canvas center.
 */
const probePoint = (index: number): number[] => [(index - 1) * 10, index - 1];

/** Where the probe's middle point lands on the canvas */
export const PROBE = { x: 0.5, y: 0.5 };

/** The probe's middle sample's media file */
export const PROBE_FILE = "1.png";

export const probeLine = {
  numSamples: 3,
  visualizations: [{ brainKey: BRAIN_KEY, points: probePoint }],
} satisfies ImageSeed;

/** One detection box in the image's center */
const box = (labelName: string, label: LabelBuilders) => ({
  ground_truth: label.detections([
    label.detection({ label: labelName, bounding_box: [0.25, 0.25, 0.5, 0.5] }),
  ]),
});

/** Samples whose one patch is a "cat", in the left cluster */
export const PATCH_A = 12;

/** Samples whose one patch is a "dog", in the right cluster */
export const PATCH_B = 8;

export const PATCH_TOTAL = PATCH_A + PATCH_B;

/** A patches run over `ground_truth`, one detection per sample */
export const patchClusters = {
  numSamples: PATCH_TOTAL,
  schema: { ground_truth: "Detections" },
  withSampleData: ({ index }, { label }) =>
    box(index < PATCH_A ? "cat" : "dog", label),
  visualizations: [
    {
      brainKey: BRAIN_KEY,
      patchesField: "ground_truth",
      points: (index) => [clusterPoint(index, PATCH_A)],
    },
  ],
} satisfies ImageSeed;

/** Samples each holding two detections, a "cat" and a "dog" */
export const PAIR_SAMPLES = 6;

export const PAIR_PATCHES = PAIR_SAMPLES * 2;

/** The patches run beside the samples run in {@link twoPatchesEach} */
export const PATCHES_BRAIN_KEY = "viz_patches";

/** A saved view of the dataset's patches, for a patches grid */
export const PATCHES_VIEW = "patches";

/**
 * Two runs over the same samples: one point per sample, and one point per
 * detection. Selections cross granularities between them — a patch lights
 * its sample's point, a sample lights both of its patches.
 */
export const twoPatchesEach = {
  numSamples: PAIR_SAMPLES,
  schema: { ground_truth: "Detections" },
  withSampleData: (_, { label }) => ({
    ground_truth: label.detections([
      label.detection({ label: "cat", bounding_box: [0.1, 0.1, 0.3, 0.3] }),
      label.detection({ label: "dog", bounding_box: [0.6, 0.6, 0.3, 0.3] }),
    ]),
  }),
  savedViews: { [PATCHES_VIEW]: 'dataset.to_patches("ground_truth")' },
  visualizations: [
    {
      brainKey: BRAIN_KEY,
      points: (index) => clusterPoint(index, PAIR_SAMPLES / 2),
    },
    {
      brainKey: PATCHES_BRAIN_KEY,
      patchesField: "ground_truth",
      points: (index) => [
        clusterPoint(index * 2, PAIR_SAMPLES),
        clusterPoint(index * 2 + 1, PAIR_SAMPLES),
      ],
    },
  ],
} satisfies ImageSeed;

/** The probe line as a patches run: one detection per sample */
export const probePatches = {
  numSamples: 3,
  schema: { ground_truth: "Detections" },
  withSampleData: (_, { label }) => box("cat", label),
  visualizations: [
    {
      brainKey: BRAIN_KEY,
      patchesField: "ground_truth",
      points: (index) => [probePoint(index)],
    },
  ],
} satisfies ImageSeed;

/** A panel in a workspace: its type, a fixed id, and an optional `state` */
interface WorkspacePanel {
  type: string;
  id: string;
  /** A Python expression, e.g. `dict(brainResult="viz")` */
  state?: string;
}

/**
 * Python for a workspace with the grid on the left and `panels` as tabs on
 * the right, the first one showing. Every space names its `active_child`, as
 * the App's own saves do: without one a space renders its tab but no content.
 */
const splitWorkspace = (panels: WorkspacePanel[]): string => {
  const tabs = panels
    .map(
      ({ type, id, state }) =>
        `fo.Panel(type="${type}", component_id="${id}"${
          state ? `, state=${state}` : ""
        })`,
    )
    .join(", ");
  return `fo.Space(
    component_id="root",
    children=[
        fo.Space(
            children=[fo.Panel(type="Samples", pinned=True, component_id="samples")],
            active_child="samples",
        ),
        fo.Space(children=[${tabs}], active_child="${panels[0].id}"),
    ],
    orientation="horizontal",
    active_child="${panels[0].id}",
)`;
};

export const PLOT_WORKSPACE = "plot";

/** The grid beside the embeddings panel, open on the run, colored by cluster */
export const plotWorkspace = splitWorkspace([
  {
    type: "Embeddings",
    id: "embeddings",
    state: `dict(brainResult="${BRAIN_KEY}", colorByField="cluster")`,
  },
]);

export const STALE_WORKSPACE = "stale";

/** A workspace whose embeddings panel names a run the dataset doesn't have */
export const staleWorkspace = splitWorkspace([
  {
    type: "Embeddings",
    id: "embeddings",
    state: `dict(brainResult="deleted_run")`,
  },
]);

/** A second run over {@link twoClusters}: the same blobs, mirrored */
export const MIRRORED_BRAIN_KEY = "viz_mirrored";

export const mirroredPoint = (index: number): number[] => {
  const [x, y] = plantedPoint(index);
  return [-x, y];
};

export const TABS_WORKSPACE = "tabs";

/** The grid beside two tabs: the embeddings panel on the run, then histograms */
export const tabsWorkspace = splitWorkspace([
  {
    type: "Embeddings",
    id: "embeddings",
    state: `dict(brainResult="${BRAIN_KEY}")`,
  },
  { type: "Histograms", id: "histograms" },
]);

/** Groups in the left cluster (`cluster: "a"`); the rest are `b` */
export const GROUP_A = 12;

export const GROUPS = 20;

/** The run over the non-default `right` slice */
export const RIGHT_BRAIN_KEY = "viz_right";

/** Two image slices with one run over each, clustered by group index */
export const groupClusters = {
  mediaType: "group",
  numGroups: GROUPS,
  slices: [
    { name: "left", mediaType: "image" },
    { name: "right", mediaType: "image" },
  ],
  schema: { cluster: "StringField" },
  withSampleData: ({ groupIndex }) => ({
    cluster: groupIndex < GROUP_A ? "a" : "b",
  }),
  visualizations: [
    {
      brainKey: BRAIN_KEY,
      slice: "left",
      points: (groupIndex) => clusterPoint(groupIndex, GROUP_A),
    },
    {
      brainKey: RIGHT_BRAIN_KEY,
      slice: "right",
      points: (groupIndex) => clusterPoint(groupIndex, GROUP_A),
    },
  ],
} satisfies GroupSeed;
