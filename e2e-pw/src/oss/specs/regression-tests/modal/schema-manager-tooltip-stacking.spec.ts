import { test as base } from "src/oss/fixtures";
import { ModalPom } from "src/oss/poms/modal";
import { SchemaManagerPom } from "src/oss/poms/schema-manager";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix("tooltip-stacking");
const id = "000000000000000000000000";

const test = base.extend<{
  modal: ModalPom;
  schemaManager: SchemaManagerPom;
}>({
  modal: async ({ page, eventUtils }, use) => {
    await use(new ModalPom(page, eventUtils));
  },
  schemaManager: async ({ page, eventUtils }, use) => {
    await use(new SchemaManagerPom(page, eventUtils));
  },
});

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test.beforeAll(async ({ datasetFactory, foWebServer }) => {
  await foWebServer.startWebServer();
  await datasetFactory.createBlankDataset({
    datasetName,
    schema: { detections: "Detections" },
    withSampleData: () => {
      return {
        detections: {
          detections: [{ bounding_box: [0, 0, 1, 1], label: "cat" }],
        },
      };
    },
  });
});

test.describe.serial("schema manager tooltip z-index stacking", () => {
  test.beforeEach(async ({ fiftyoneLoader, page }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
      searchParams: new URLSearchParams({ id }),
    });
  });

  test("tooltip does not appear above schema manager modal", async ({
    modal,
    schemaManager,
  }) => {
    await modal.assert.isOpen();
    await modal.waitForSampleLoadDomAttribute();

    await modal.sampleCanvas.move(0.5, 0.5, "pointer");
    await modal.sampleCanvas.tooltip.assert.isVisible();
    await modal.sampleCanvas.tooltip.toggleLock();
    await modal.sampleCanvas.tooltip.assert.isLocked();

    await modal.sidebar.switchMode("annotate");
    await schemaManager.open();
    await schemaManager.assert.isOpen();

    await modal.sampleCanvas.tooltip.assert.isBehindSchemaManager();
  });
});
