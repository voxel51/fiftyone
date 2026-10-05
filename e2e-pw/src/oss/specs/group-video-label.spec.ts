import { test as base } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix("video-label-regression");
const testVideoPath1 = `/tmp/test-video1-${datasetName}.webm`;
const testVideoPath2 = `/tmp/test-video2-${datasetName}.webm`;

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

test.beforeAll(async ({ fiftyoneLoader, foWebServer, mediaFactory }) => {
  await foWebServer.startWebServer();

  await Promise.all(
    [testVideoPath1, testVideoPath2].map((outputPath) =>
      mediaFactory.createVideo({
        outputPath,
        duration: 3,
        width: 100,
        height: 100,
        frameRate: 5,
        color: "#000000",
      }),
    ),
  );

  await fiftyoneLoader.executePythonCode(
    `
    import fiftyone as fo
    dataset = fo.Dataset("${datasetName}")
    dataset.persistent = True
    dataset.add_group_field("group", default="v1")

    group = fo.Group()
    sample1 = fo.Sample(filepath="${testVideoPath1}", group=group.element("v1"))
    sample2 = fo.Sample(filepath="${testVideoPath2}", group=group.element("v2"))
    dataset.add_samples([sample1, sample2])

    dataset.ensure_frames()

    for _, frame in sample1.frames.items():
      d1 = fo.Detection(bounding_box=[0.1, 0.1, 0.2, 0.2], label="s1d1")
      frame["d1"] = d1
    sample1.save()

    for _, frame in sample2.frames.items():
      d2 = fo.Detection(bounding_box=[0.2, 0.2, 0.25, 0.25], label="s1d2")
      frame["d2"] = d2
    sample2.save() 
    `,
  );
});

test.describe.serial("groups video labels", () => {
  test.beforeEach(async ({ page, fiftyoneLoader }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName, { tiles: 1 });
  });

  test("correct thumbnails for both slices", async ({ grid }) => {
    await grid.sliceSelector.assert.verifySliceSelectorIsAvailable();
    await grid.sliceSelector.assert.verifyHasSlices(["v1", "v2"]);

    // compare screenshot for default slice (v1)
    await grid.assert.hasScreenshot("slice-v1.png", {
      target: grid.getNthLooker(0),
    });

    // compare screenshot for another slice (v2)
    await grid.afterTilesDrawn(1, () =>
      grid.run(() => grid.sliceSelector.selectSlice("v2")),
    );
    await grid.assert.hasScreenshot("slice-v2.png", {
      target: grid.getNthLooker(0),
    });
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
      await modal.video.playUntilAdvanced();

      await modal.sampleCanvas.assert.hasScreenshot(`${slice}-played.png`);
    };

    await checkVideo("v1");

    // change slice and repeat
    await eventUtils.after(
      "e2e:looker:canvas-loaded",
      () => modal.group.selectNthItemFromCarousel(1),
      (e) =>
        (e.detail as { sampleFilepath?: string })?.sampleFilepath ===
        testVideoPath2,
    );

    await checkVideo("v2");
  });
});
