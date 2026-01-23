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
const keyboardNavDatasetName = getUniqueDatasetNameWithPrefix(
  `media-field-keyboard-nav`
);

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

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test.beforeAll(async ({ fiftyoneLoader, foWebServer }) => {
  await foWebServer.startWebServer();

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

test.afterEach(async ({ modal, page }) => {
  await modal.close({ ignoreError: true });
  await page.reload();
});

test.describe.serial("media field", () => {
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
});

test.describe.serial("media field keyboard navigation", () => {
  const KEYBOARD_NAV_IMAGES = {
    field1: "#ff0000", // red
    field2: "#00ff00", // green
    field3: "#0000ff", // blue
  };

  test.beforeAll(async ({ fiftyoneLoader }) => {
    // Create distinct colored images for each media field
    const createPromises = Object.entries(KEYBOARD_NAV_IMAGES).map(
      ([key, color]) =>
        createBlankImage({
          outputPath: `/tmp/${key}-keyboard-nav.png`,
          width: 100,
          height: 100,
          fillColor: color,
          hideLogs: true,
        })
    );
    await Promise.all(createPromises);

    await fiftyoneLoader.executePythonCode(`
      import fiftyone as fo

      dataset = fo.Dataset("${keyboardNavDatasetName}")
      dataset.persistent = True

      dataset.add_sample(
          fo.Sample(
              filepath="/tmp/field1-keyboard-nav.png",
              field2="/tmp/field2-keyboard-nav.png",
              field3="/tmp/field3-keyboard-nav.png",
          )
      )

      # Configure multiple media fields for keyboard navigation
      dataset.app_config.media_fields = ["filepath", "field2", "field3"]
      dataset.app_config.modal_media_field = "filepath"
      dataset.save()
    `);
  });

  test("PageDown navigates to next media field", async ({
    fiftyoneLoader,
    grid,
    modal,
    page,
  }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, keyboardNavDatasetName);
    await grid.openFirstSample();
    await modal.waitForSampleLoadDomAttribute();

    // Initial screenshot
    await modal.hideControls();
    const initialScreenshot = await modal.looker.screenshot();

    // Go to next media field
    await page.keyboard.press("PageDown");
    await modal.waitForSampleLoadDomAttribute();

    const afterPageDownScreenshot = await modal.looker.screenshot();

    // Screenshots should be different
    expect(initialScreenshot).not.toEqual(afterPageDownScreenshot);
  });

  test("PageUp navigates to previous media field", async ({
    fiftyoneLoader,
    grid,
    modal,
    page,
  }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, keyboardNavDatasetName);
    await grid.openFirstSample();
    await modal.waitForSampleLoadDomAttribute();
    await modal.hideControls();

    // Navigate forward
    await page.keyboard.press("PageDown");
    await modal.waitForSampleLoadDomAttribute();

    const afterPageDownScreenshot = await modal.looker.screenshot();

    // Navigate back
    await page.keyboard.press("PageUp");
    await modal.waitForSampleLoadDomAttribute();

    const afterPageUpScreenshot = await modal.looker.screenshot();

    // Screenshots should be different
    expect(afterPageDownScreenshot).not.toEqual(afterPageUpScreenshot);
  });

  test("media field navigation wraps around", async ({
    fiftyoneLoader,
    grid,
    modal,
    page,
  }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, keyboardNavDatasetName);
    await grid.openFirstSample();
    await modal.waitForSampleLoadDomAttribute();
    await modal.hideControls();

    const initialScreenshot = await modal.looker.screenshot();

    // Cycle through all fields
    await page.keyboard.press("PageDown");
    await modal.waitForSampleLoadDomAttribute();
    await page.keyboard.press("PageDown");
    await modal.waitForSampleLoadDomAttribute();
    await page.keyboard.press("PageDown");
    await modal.waitForSampleLoadDomAttribute();

    const afterCycleScreenshot = await modal.looker.screenshot();

    // Should be the same
    expect(initialScreenshot).toEqual(afterCycleScreenshot);
  });
});
