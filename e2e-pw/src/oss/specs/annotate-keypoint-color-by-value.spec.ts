/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Per-point color-by-value on a keypoint. With the field colored by value on
 * a per-point attribute, each node fills by its own entry while the edges
 * keep the label color. The color scheme is dataset setup through the
 * factory's `appConfig` (its own dataset, so it recolors no other spec's
 * baselines); the check is the render.
 */
import { test as base } from "src/oss/fixtures";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";
import { indexToId } from "src/shared/utils";

const datasetName = getUniqueDatasetNameWithPrefix(
  "annotate-keypoint-color-by-value",
);

const FIELD = "keypoints";

/** The skeleton's node names. */
const SKELETON_NODES = ["nose", "left-eye", "right-eye", "mouth"];

/** Relative coordinates, one per node: the 2D spec's diamond, fully placed. */
const POINTS: Array<[number, number]> = [
  [0.45, 0.3],
  [0.35, 0.42],
  [0.55, 0.42],
  [0.45, 0.6],
];

/** The per-point attribute, one entry per node: magenta, blue, magenta, blue. */
const OCCLUDED = [true, false, true, false];

const test = base.extend<{ modal: ModalPom }>({
  modal: async ({ page, eventUtils }, use) => {
    await use(new ModalPom(page, eventUtils));
  },
});

test.beforeAll(async ({ datasetFactory, foWebServer }) => {
  await foWebServer.startWebServer();
  await datasetFactory.createDataset({
    datasetName,
    numSamples: 1,
    // the dataset's color scheme colors the field by its per-point attribute;
    // the pinned one-color pool keeps the label (edge) color deterministic
    appConfig: {
      color_scheme: {
        color_by: "value",
        color_pool: ["#FA5300"],
        fields: [
          {
            path: FIELD,
            colorByAttribute: "occluded",
            valueColors: [
              { value: "true", color: "#ff00ff" },
              { value: "false", color: "#0000ff" },
            ],
          },
        ],
      },
    },
    imageOptions: { fillColor: "white", width: 640, height: 480 },
    schema: {
      [FIELD]: "Keypoints",
      [`${FIELD}.keypoints.occluded`]: "ListField<BooleanField>",
    },
    skeletons: {
      [FIELD]: {
        labels: SKELETON_NODES,
        edges: [
          [0, 1],
          [0, 2],
          [1, 3],
          [2, 3],
        ],
      },
    },
    labelSchemas: {
      [FIELD]: {
        type: "keypoints",
        classes: ["person"],
        attributes: [
          {
            name: "occluded",
            type: "bool",
            component: "toggle",
            scope: "point",
          },
        ],
        component: "dropdown",
      },
    },
    withSampleData: (_, { label }) => ({
      [FIELD]: label.keypoints([
        label.keypoint({
          label: "person",
          points: POINTS,
          occluded: OCCLUDED,
        }),
      ]),
    }),
  });
});

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test.describe("keypoint color by value", () => {
  test("each node fills by its own per-point value", async ({
    fiftyoneLoader,
    modal,
    page,
  }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
      searchParams: new URLSearchParams({ id: indexToId(0) }),
      modalSample: "loaded",
    });
    await modal.assert.isOpen();
    await modal.sidebar.annotate.afterLabelList(() =>
      modal.afterLighterReady(() => modal.sidebar.switchMode("annotate")),
    );
    await modal.sidebar.annotate.assert.hasActiveLabelsCount(1);

    // magenta where occluded, blue where not; the edges keep the label color
    await modal.sampleCanvas.assert.hasMediaScreenshot(
      "keypoint-color-by-value.png",
    );
  });
});
