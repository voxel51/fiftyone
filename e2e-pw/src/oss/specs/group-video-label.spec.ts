import { test as base } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix("video-label-regression");
// the v2 slice's video, set once the dataset exists
let v2Filepath: string;

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
  const video = {
    duration: 3,
    width: 100,
    height: 100,
    frameRate: 5,
    color: "#000000",
  };
  const samples = await datasetFactory.createDataset({
    mediaType: "group",
    datasetName,
    numGroups: 1,
    slices: [
      { name: "v1", mediaType: "video", videoOptions: video },
      { name: "v2", mediaType: "video", videoOptions: video },
    ],
    schema: { "frames.d1": "Detection", "frames.d2": "Detection" },
    withFrameData: ({ sampleIndex }, { label }) =>
      sampleIndex === 0
        ? {
            d1: label.detection({
              bounding_box: [0.1, 0.1, 0.2, 0.2],
              label: "s1d1",
            }),
          }
        : {
            d2: label.detection({
              bounding_box: [0.2, 0.2, 0.25, 0.25],
              label: "s1d2",
            }),
          },
  });
  v2Filepath = samples[1].filepath;
});

test.describe.serial("groups video labels", () => {
  test.beforeEach(async ({ page, fiftyoneLoader }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName, { tiles: 1 });
  });

  test("correct thumbnails for both slices", async ({ grid }) => {
    await grid.sliceSelector.assert.verifySliceSelectorIsAvailable();
    await grid.sliceSelector.assert.verifyHasSlices(["v1", "v2"]);

    // compare screenshot for default slice (v1)
    await grid.assert.hasTileScreenshots("slice-v1", 1);

    // compare screenshot for another slice (v2)
    await grid.afterTilesDrawn(1, () =>
      grid.run(() => grid.sliceSelector.selectSlice("v2")),
    );
    await grid.assert.hasTileScreenshots("slice-v2", 1);
  });

  test("video plays with correct label for each slice", async ({
    grid,
    modal,
    eventUtils,
  }) => {
    // Reset to the default slice, but only when an earlier test left another
    // one selected: re-picking the slice already on screen refreshes nothing,
    // and the armed refresh would never arrive.
    if ((await grid.sliceSelector.activeSlice()) !== "v1") {
      await grid.run(async () => {
        await grid.sliceSelector.selectSlice("v1");
      });
    }

    await modal.afterSampleLoaded(() => grid.openFirstSample());

    const checkVideo = async (slice: "v1" | "v2") => {
      await modal.assert.verifyModalSamplePluginTitle(slice, { pinned: true });

      await modal.sampleCanvas.move(0.5, 0.5);
      // an exact reading: a stale one from the previous slice resets on load
      await modal.video.playUntilDuration("0:00.20");

      await modal.groupSampleCanvas.assert.hasScreenshot(`${slice}-played.png`);
    };

    await checkVideo("v1");

    // change slice and repeat
    await eventUtils.after(
      "e2e:looker:canvas-loaded",
      () => modal.group.selectNthItemFromCarousel(1),
      (e) =>
        (e.detail as { sampleFilepath?: string })?.sampleFilepath ===
        v2Filepath,
    );

    await checkVideo("v2");
  });
});
