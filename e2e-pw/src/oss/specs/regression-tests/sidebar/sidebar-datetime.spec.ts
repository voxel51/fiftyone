import { test as base } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { SidebarPom } from "src/oss/poms/sidebar";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

/**
 * This test makes sure that a ragged group dataset with default video slice works as expected.
 * Video also has bounding box labels.
 */

const datasetName = getUniqueDatasetNameWithPrefix("datetime-regression");
const testImgPath = `/tmp/test-img-${datasetName}.jpg`;
const testImgPath2 = `/tmp/test-img-2-${datasetName}.jpg`;

const test = base.extend<{
  grid: GridPom;
  modal: ModalPom;
  sidebar: SidebarPom;
}>({
  grid: async ({ page }, use) => {
    await use(new GridPom(page));
  },
  modal: async ({ page }, use) => {
    await use(new ModalPom(page));
  },
  sidebar: async ({ page }, use) => {
    await use(new SidebarPom(page));
  },
});

test.describe("date field and date time field can filter visibility", () => {
  test.beforeAll(async ({ fiftyoneLoader }) => {
    await fiftyoneLoader.executePythonCode(`
        import fiftyone as fo

        dataset = fo.Dataset("${datasetName}")
        dataset.persistent = True

        `);
  });

  test.beforeEach(async ({ page, fiftyoneLoader }) => {
    fiftyoneLoader.waitUntilLoad(page, datasetName);
  });

  test("filter date and date time works", async ({
    sidebar,
    grid,
    modal,
    eventUtils,
  }) => {
    // await grid.sliceSelector.assert.verifyHasSlices(["video", "image"]);
    // await grid.sliceSelector.assert.verifyActiveSlice("video");
    // await grid.assert.assertNLookers(1);
    // await grid.openFirstLooker();
    // await modal.waitForSampleLoadDomAttribute();
    // await modal.waitForCarouselToLoad();
    // await modal.assert.verifyCarouselLength(2);
    // await modal.close();
    // const imgLoadedPromise = eventUtils.getEventReceivedPromiseForPredicate(
    //   "sample-loaded",
    //   (e) => e.detail.sampleFilepath === testImgPath
    // );
    // await grid.selectSlice("image");
    // await imgLoadedPromise;
    // await grid.assert.assertNLookers(2);
    // await grid.openFirstLooker();
    // await modal.waitForSampleLoadDomAttribute();
    // await modal.waitForCarouselToLoad();
    // await modal.assert.verifyCarouselLength(2);
    // await modal.navigateNextSample();
    // await modal.assert.verifyCarouselLength(1);
  });
});
