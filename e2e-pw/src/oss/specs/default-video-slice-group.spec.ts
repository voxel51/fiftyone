import { test as base } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

/**
 * This test makes sure that a ragged group dataset with default video slice works as expected.
 * Video also has bounding box labels.
 */

const datasetName = getUniqueDatasetNameWithPrefix(
  "video-default-group-slice-regression",
);

const test = base.extend<{ grid: GridPom; modal: ModalPom }>({
  grid: async ({ page, eventUtils }, use) => {
    await use(new GridPom(page, eventUtils));
  },
  modal: async ({ page, eventUtils }, use) => {
    await use(new ModalPom(page, eventUtils));
  },
});

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test.beforeAll(async ({ datasetFactory, foWebServer }) => {
  await foWebServer.startWebServer();
  // the first group has a video and an image, the second only an image
  await datasetFactory.createDataset({
    mediaType: "group",
    datasetName,
    numGroups: 2,
    slices: [
      {
        name: "video",
        mediaType: "video",
        groupIndices: [0],
        videoOptions: {
          duration: 2,
          width: 50,
          height: 50,
          frameRate: 5,
          color: "#000000",
        },
      },
      {
        name: "image",
        mediaType: "image",
        imageOptions: { width: 50, height: 50 },
      },
    ],
    schema: { "frames.d1": "Detection" },
    withFrameData: (_, { label }) => ({
      d1: label.detection({ bounding_box: [0.1, 0.1, 0.2, 0.2] }),
    }),
  });
});

test.describe.serial("default video slice group", () => {
  test.beforeEach(async ({ page, fiftyoneLoader }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
  });

  test("video as default slice renders", async ({ grid, modal }) => {
    await grid.sliceSelector.assert.verifyHasSlices(["video", "image"]);
    await grid.sliceSelector.assert.verifyActiveSlice("video");
    await grid.assert.isTileCountEqualTo(1);

    await modal.afterCarouselRendered(() =>
      modal.afterSampleLoaded(() => grid.openFirstSample()),
    );
    await modal.assert.verifyCarouselLength(2);
    await modal.close();

    await grid.selectSlice("image");

    await grid.assert.isTileCountEqualTo(2);
    await modal.afterCarouselRendered(() =>
      modal.afterSampleLoaded(() => grid.openFirstSample()),
    );
    await modal.assert.verifyCarouselLength(2);
    await modal.afterCarouselRendered(() => modal.navigateNextSample());
    await modal.assert.verifyCarouselLength(1);
  });
});
