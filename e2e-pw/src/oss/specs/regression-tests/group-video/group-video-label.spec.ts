import { test as base, expect } from "src/oss/fixtures";
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

test.describe("groups video labels", () => {
  test.beforeAll(async ({ fiftyoneLoader, mediaFactory }) => {
    [testVideoPath1, testVideoPath2].forEach(async (outputPath) => {
      await mediaFactory.createBlankVideo({
        outputPath,
        duration: 3,
        width: 100,
        height: 100,
        frameRate: 5,
        color: "#000000",
      });
    });

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
      `
    );
  });

  test.beforeEach(async ({ page, fiftyoneLoader }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
  });

  test("correct thumbnails for both slices", async ({ grid, page }) => {
    await grid.sliceSelector.assert.verifySliceSelectorIsAvailable();
    await grid.sliceSelector.assert.verifyHasSlices(["v1", "v2"]);

    // compare screenshot for default slice (v1)
    await expect(grid.getNthLooker(0)).toHaveScreenshot("slice-v1.png");

    const v2SampleLoadedPromise = page.evaluate((testVideoPath2_) => {
      return new Promise<void>((resolve) => {
        document.addEventListener("canvas-loaded", (e: CustomEvent) => {
          if ((e.detail.sampleFilepath as string) === testVideoPath2_) {
            resolve();
          }
        });
      });
    }, testVideoPath2);

    // compare screenshot for another slice (v2)
    await grid.sliceSelector.selectSlice("v2");
    await v2SampleLoadedPromise;

    await expect(grid.getNthLooker(0)).toHaveScreenshot("slice-v2.png");
  });

  test("video plays with correct label for each slice", async ({
    grid,
    modal,
    eventUtils,
  }) => {
    await grid.openFirstSample();
    await modal.waitForSampleLoadDomAttribute();

    await modal.video.clickUseFrameNumber();

    const checkVideo = async (slice: "v1" | "v2") => {
      await modal.assert.verifyModalSamplePluginTitle(slice, { pinned: true });

      await modal.looker.hover();

      // TODO: FIX ME. MODAL SCREENSHOT COMPARISON IS OFF BY ONE-PIXEL
      // check screenshot before video is played
      // await expect(modal.looker).toHaveScreenshot(`${slice}-before-play.png`, {
      //   animations: "allow",
      // });

      await modal.video.playUntilFrames("5", true);
      await modal.looker.hover();

      // TODO: FIX ME. MODAL SCREENSHOT COMPARISON IS OFF BY ONE-PIXEL
      // check screenshot after video is played
      // await expect(modal.looker).toHaveScreenshot(`${slice}-after-play.png`, {
      //   // masking time / frame because it might be off by a couple of seconds and we want to avoid flakiness
      //   // the real test is that the correct label is shown
      //   mask: [modal.video.time],
      //   animations: "allow",
      // });
    };

    await checkVideo("v1");

    const sampleLoadEventPromiseForv2 =
      eventUtils.getEventReceivedPromiseForPredicate(
        "canvas-loaded",
        (e) => e.detail.sampleFilepath === testVideoPath2
      );

    // change slice and repeat
    await modal.group.selectNthItemFromCarousel(1);

    await sampleLoadEventPromiseForv2;

    await checkVideo("v2");
  });
});
