import {
  ground_truth_schema,
  uniqueness_schema,
} from "src/oss/assets/annotate-schemas";
import { test as base } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix("smoke-annotate-sidebar");

const test = base.extend<{
  grid: GridPom;
  modal: ModalPom;
}>({
  grid: async ({ page, eventUtils }, use) => {
    await use(new GridPom(page, eventUtils));
  },
  modal: async ({ page, eventUtils }, use) => {
    await use(new ModalPom(page, eventUtils));
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

test.describe.serial("annotate-sidebar-smoke", () => {
  test("smoke", async ({ grid, modal, annotateSDK }) => {
    await annotateSDK.updateLabelSchema(
      datasetName,
      "ground_truth",
      ground_truth_schema,
    );
    await annotateSDK.addFieldToActiveLabelSchema(datasetName, "ground_truth");
    await annotateSDK.updateLabelSchema(
      datasetName,
      "uniqueness",
      uniqueness_schema,
    );
    await annotateSDK.addFieldToActiveLabelSchema(datasetName, "uniqueness");

    await grid.openFirstSample();
    await modal.waitForSampleLoadDomAttribute();

    await modal.sidebar.switchMode("annotate");

    await modal.sidebar.annotate.assert.verifyActiveLabelsCount(3);
    await modal.sidebar.annotate.assert.verifyActivePrimitiveFieldsCount(1);

    await modal.sidebar.annotate.assert.verifyActiveLabelsIsExpanded();
    await modal.sidebar.annotate.toggleActiveLabels();
    await modal.sidebar.annotate.assert.verifyActiveLabelsIsCollapsed();
    await modal.sidebar.annotate.toggleActiveLabels();
    await modal.sidebar.annotate.assert.verifyActiveLabelsIsExpanded();

    await modal.sidebar.annotate.assert.verifyActivePrimitiveFieldsIsExpanded();
    await modal.sidebar.annotate.toggleActivePrimitiveFields();
    await modal.sidebar.annotate.assert.verifyActivePrimitiveFieldsIsCollapsed();
    await modal.sidebar.annotate.toggleActivePrimitiveFields();
    await modal.sidebar.annotate.assert.verifyActivePrimitiveFieldsIsExpanded();

    await modal.sidebar.annotate.selectActivePrimitiveField("uniqueness");
  });
});
