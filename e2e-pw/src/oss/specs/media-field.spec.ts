import { test as base } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

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

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test.beforeAll(async ({ datasetFactory, foWebServer }) => {
  await foWebServer.startWebServer();
  await datasetFactory.createDataset({
    datasetName,
    mediaFields: {
      grid: { width: 50, height: 50, fillColor: IMAGES.grid },
      modal: { width: 50, height: 50, fillColor: IMAGES.modal },
    },
    appConfig: {
      media_fields: ["grid", "modal"],
      grid_media_field: "grid",
      modal_media_field: "modal",
    },
  });
});

test.afterEach(async ({ modal, page }) => {
  await modal.close({ ignoreError: true });
  await page.reload();
});

test.describe.serial("media field", () => {
  test("grid media field", async ({ fiftyoneLoader, grid, page }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName, { tiles: 1 });
    await grid.assert.hasTileScreenshots("grid-media-field", 1);
  });

  test("modal media field", async ({ grid, fiftyoneLoader, modal, page }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
    await modal.afterSampleLoaded(() => grid.openFirstSample());
    await modal.sampleCanvas.assert.hasScreenshot("modal-media-field.png");
  });
});
