import { test as base } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

/**
 * This test makes sure that a ragged group dataset with default video slice works as expected.
 * Video also has bounding box labels.
 */

const datasetName = getUniqueDatasetNameWithPrefix(
  "video-default-group-slice-regression"
);
const testVideoPath = `/tmp/test-video-${datasetName}.webm`;
const testImgPath = `/tmp/test-img-${datasetName}.jpg`;
const testImgPath2 = `/tmp/test-img-2-${datasetName}.jpg`;

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
  await mediaFactory.createBlankVideo({
    outputPath: testVideoPath,
    duration: 2,
    width: 50,
    height: 50,
    frameRate: 5,
    color: "#000000",
  });

  await mediaFactory.createBlankImage({
    outputPath: testImgPath,
    width: 50,
    height: 50,
  });

  await mediaFactory.createBlankImage({
    outputPath: testImgPath2,
    width: 50,
    height: 50,
  });

  await fiftyoneLoader.executePythonCode(`
      import fiftyone as fo

      dataset = fo.Dataset("${datasetName}")
      dataset.persistent = True

      dataset.add_group_field("group", default="video")

      group1 = fo.Group()
      image_sample = fo.Sample(filepath="${testImgPath}", group=group1.element("image"))
      video_sample = fo.Sample(filepath="${testVideoPath}", group=group1.element("video"))

      group2 = fo.Group()
      image_sample2 = fo.Sample(filepath="${testImgPath2}", group=group2.element("image"))

      dataset.ensure_frames();
      for _, frame in video_sample.frames.items():
        d1 = fo.Detection(bounding_box=[0.1, 0.1, 0.2, 0.2])
        frame["d1"] = d1
      dataset.add_samples([video_sample, image_sample, image_sample2])
      `);
});

test.describe.serial("default video slice group", () => {
  test.beforeEach(async ({ page, fiftyoneLoader }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
  });

  test("video as default slice renders", async ({ grid, modal }) => {
    await grid.sliceSelector.assert.verifyHasSlices(["video", "image"]);
    await grid.sliceSelector.assert.verifyActiveSlice("video");
    await grid.assert.isLookerCountEqualTo(1);

    await grid.openFirstSample();
    await modal.waitForSampleLoadDomAttribute();
    await modal.waitForCarouselToLoad();
    await modal.assert.verifyCarouselLength(2);
    await modal.close();

    const promise = grid.getWaitForGridRefreshPromise();
    await grid.selectSlice("image");
    await promise;

    await grid.assert.isLookerCountEqualTo(2);
    await grid.openFirstSample();
    await modal.waitForSampleLoadDomAttribute();
    await modal.waitForCarouselToLoad();
    await modal.assert.verifyCarouselLength(2);
    await modal.navigateNextSample();
    await modal.waitForSampleLoadDomAttribute();
    await modal.waitForCarouselToLoad();
    await modal.assert.verifyCarouselLength(1);
  });
});
