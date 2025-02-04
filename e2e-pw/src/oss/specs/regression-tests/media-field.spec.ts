import { test as base, expect } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";
import { createBlankImage } from "src/shared/media-factory/image";

const IMAGES = {
  grid: "#cccccc",
  modal: "#ffffff",
};

const datasetName = getUniqueDatasetNameWithPrefix(`media-field`);

const test = base.extend<{
  grid: GridPom;
  modal: ModalPom;
}>({
  grid: async ({ eventUtils, page }, use) => {
    await use(new GridPom(page, eventUtils));
  },
  modal: async ({ page, eventUtils }, use) => {
    await use(new ModalPom(page, eventUtils));
  },
});

const writeImages = async () => {
  const createPromises: Promise<void>[] = [];

  Object.entries(IMAGES).forEach(([key, color]) => {
    createPromises.push(
      createBlankImage({
        outputPath: `/tmp/${key}-media-field.png`,
        width: 50,
        height: 50,
        fillColor: color,
        hideLogs: true,
      })
    );
  });

  await Promise.all(createPromises);
};

test.beforeAll(async ({ fiftyoneLoader }) => {
  await writeImages();

  await fiftyoneLoader.executePythonCode(`
  import fiftyone as fo

  dataset = fo.Dataset("${datasetName}")

  dataset.persistent = True
  dataset.add_sample(
      fo.Sample(
          grid="/tmp/grid-media-field.png",
          modal="/tmp/modal-media-field.png",
          filepath="/tmp/empty.png"
      )
  )
  
  dataset.app_config.media_fields = ["grid", "modal"]
  dataset.app_config.grid_media_field = "grid"
  dataset.app_config.modal_media_field = "modal"
  dataset.save()`);
});

test("grid media field", async ({ fiftyoneLoader, grid, page }) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
  await expect(grid.getNthLooker(0)).toHaveScreenshot("grid-media-field.png");
});

test("modal media field", async ({ grid, fiftyoneLoader, modal, page }) => {
  test.skip(
    true,
    "TODO: FIX ME. MODAL SCREENSHOT COMPARISON IS OFF BY ONE-PIXEL"
  );
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
  await grid.openFirstSample();
  await modal.waitForSampleLoadDomAttribute();
  // move off of looker to hide controls
  await page.mouse.move(0, 0);
  await expect(modal.looker).toHaveScreenshot("modal-media-field.png");
});
