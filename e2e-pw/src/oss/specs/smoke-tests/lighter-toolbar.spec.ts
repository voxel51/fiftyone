import { test as base, expect } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { ModalSidebarPom } from "src/oss/poms/modal/modal-sidebar";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix("smoke-lighter-toolbar");

const test = base.extend<{
  grid: GridPom;
  modal: ModalPom;
  modalSidebar: ModalSidebarPom;
}>({
  grid: async ({ page, eventUtils }, use) => {
    await use(new GridPom(page, eventUtils));
  },
  modal: async ({ page, eventUtils }, use) => {
    await use(new ModalPom(page, eventUtils));
  },
  modalSidebar: async ({ page }, use) => {
    await use(new ModalSidebarPom(page));
  },
});

test.beforeAll(async ({ fiftyoneLoader, foWebServer }) => {
  await foWebServer.startWebServer();
  await fiftyoneLoader.executePythonCode(`
    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset_name = "${datasetName}"
    dataset = foz.load_zoo_dataset(
      "quickstart", max_samples=5, dataset_name=dataset_name
    )
    dataset.persistent = True
  `);
});

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test.beforeEach(async ({ page, fiftyoneLoader }) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
});

test.afterEach(async ({ modal, page }) => {
  await modal.close({ ignoreError: true });
  await page.reload();
});

test.describe.serial("lighter-toolbar-smoke", () => {
  test("lighter toolbar appears when hovering over sample in annotate mode", async ({
    grid,
    modal,
    modalSidebar,
  }) => {
    await grid.openFirstSample();
    await modal.waitForSampleLoadDomAttribute();
    await modalSidebar.switchMode("annotate");

    const sampleRenderer = modal.sampleCanvas.locator.locator(
      '[data-cy="lighter-sample-renderer"]'
    );
    await expect(sampleRenderer).toBeVisible();
    await modal.sampleCanvas.toolbar.assert.isVisible(false);
    await sampleRenderer.hover();
    await modal.sampleCanvas.toolbar.assert.isVisible();
  });
});
