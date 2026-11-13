import os from "node:os";
import path from "node:path";
import { test as base } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix("detection-mask");

const colors = ["#ff0000", "#00ff00", "#0000ff"];

const maskPath = path.join(os.tmpdir(), `${datasetName}-mask.png`);

const test = base.extend<{ modal: ModalPom; grid: GridPom }>({
  modal: async ({ page, eventUtils }, use) => {
    await use(new ModalPom(page, eventUtils));
  },
  grid: async ({ page, eventUtils }, use) => {
    await use(new GridPom(page, eventUtils));
  },
});

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test.beforeAll(async ({ datasetFactory, foWebServer, mediaFactory }) => {
  await foWebServer.startWebServer();
  mediaFactory.createMaskImage({
    outputPath: maskPath,
    width: 15,
    height: 15,
    value: 1,
  });
  await datasetFactory.createDataset({
    datasetName,
    numSamples: colors.length,
    imageOptions: (index) => ({
      width: 25,
      height: 25,
      fillColor: colors[index],
    }),
    schema: { ground_truth: "Detections", prediction: "Detection" },
    withSampleData: ({ index }, { label, mask }) =>
      [
        // an empty mask
        {
          ground_truth: label.detections([
            label.detection({
              label: "bad_mask_detection",
              bounding_box: [0.0, 0.0, 0.0, 0.0],
              mask: mask(0, 0),
            }),
          ]),
        },
        {
          ground_truth: label.detections([
            label.detection({
              label: "good_mask_detection",
              bounding_box: [0.0, 0.0, 0.5, 0.5],
              mask: mask(15, 15),
            }),
          ]),
        },
        // a mask on disk
        {
          prediction: label.detection({
            label: "good_mask_detection_path",
            bounding_box: [0.0, 0.0, 0.5, 0.5],
            mask_path: maskPath,
          }),
        },
      ][index],
    appConfig: {
      default_visibility_labels: { include: ["ground_truth", "prediction"] },
    },
  });
});

test.beforeEach(async ({ page, fiftyoneLoader }) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
    tiles: colors.length,
  });
});

test.describe.serial("detection-mask", () => {
  test("should load all masks fine", async ({ grid, modal }) => {
    await grid.assert.isEntryCountTextEqualTo(`${colors.length} samples`);

    // bad sample, assert it loads in the modal fine, too
    await modal.afterSampleLoaded(() => grid.openFirstSample());

    // close modal and assert grid screenshot (compares all detections)
    await modal.close();

    await grid.assert.hasTileScreenshots("grid-detections", colors.length);
  });
});
