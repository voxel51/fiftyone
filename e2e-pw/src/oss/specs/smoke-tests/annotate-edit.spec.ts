import { test as base } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { SidebarPom } from "src/oss/poms/sidebar";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";
import {
  ground_truth_schema,
  uniqueness_schema,
} from "src/oss/assets/annotate-schemas";
import { ModalAnnotateSidebarPom } from "src/oss/poms/modal/annotate-sidebar";
import { ModalSidebarPom } from "src/oss/poms/modal/modal-sidebar";
import { ModalAnnotateEditPom } from "src/oss/poms/modal/annotate-edit";

const datasetName = getUniqueDatasetNameWithPrefix("smoke-annotate-edit");

const test = base.extend<{
  grid: GridPom;
  modal: ModalPom;
  modalAnnotateSidebar: ModalAnnotateSidebarPom;
  modalSidebar: ModalSidebarPom;
  sidebar: SidebarPom;
  modalAnnotateEdit: ModalAnnotateEditPom;
}>({
  grid: async ({ page, eventUtils }, use) => {
    await use(new GridPom(page, eventUtils));
  },
  modal: async ({ page, eventUtils }, use) => {
    await use(new ModalPom(page, eventUtils));
  },
  modalAnnotateSidebar: async ({ page }, use) => {
    await use(new ModalAnnotateSidebarPom(page));
  },
  modalSidebar: async ({ page }, use) => {
    await use(new ModalSidebarPom(page));
  },
  sidebar: async ({ page }, use) => {
    await use(new SidebarPom(page));
  },
  modalAnnotateEdit: async ({ page }, use) => {
    await use(new ModalAnnotateEditPom(page));
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
  test("smoke", async ({
    grid,
    modal,
    annotateSDK,
    modalSidebar,
    modalAnnotateSidebar,
    modalAnnotateEdit,
  }) => {
    await annotateSDK.updateLabelSchema(
      datasetName,
      "ground_truth",
      ground_truth_schema
    );
    await annotateSDK.addFieldToActiveLabelSchema(datasetName, "ground_truth");
    await annotateSDK.updateLabelSchema(
      datasetName,
      "uniqueness",
      uniqueness_schema
    );
    await annotateSDK.addFieldToActiveLabelSchema(datasetName, "uniqueness");
    await grid.openFirstSample();
    await modal.waitForSampleLoadDomAttribute();
    await modalSidebar.switchMode("annotate");
    await modalAnnotateSidebar.selectActiveLabel("bird", 1);
    await modalAnnotateEdit.assert.verifyUndoButtonDisabled();
    await modalAnnotateEdit.assert.verifyRedoButtonDisabled();
    await modalAnnotateEdit.assert.verifyFieldLabel("confidence", "confidence");
    await modalAnnotateEdit.setFieldValue("confidence", "0.85");
    await modalAnnotateEdit.assert.verifyFieldValue("confidence", "0.85");
    await modalAnnotateEdit.assert.verifyUndoButtonEnabled();
    await modalAnnotateEdit.assert.verifyRedoButtonDisabled();
    await modalAnnotateEdit.undo();
    await modalAnnotateEdit.assert.verifyFieldValue("confidence", "");
    await modalAnnotateEdit.assert.verifyUndoButtonDisabled();
    await modalAnnotateEdit.assert.verifyRedoButtonEnabled();
    await modalAnnotateEdit.redo();
    await modalAnnotateEdit.assert.verifyFieldValue("confidence", "0.85");
    await modalAnnotateEdit.assert.verifyUndoButtonEnabled();
    await modalAnnotateEdit.assert.verifyRedoButtonDisabled();
  });
});
