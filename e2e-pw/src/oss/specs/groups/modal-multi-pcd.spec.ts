import { test as base } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const test = base.extend<{ grid: GridPom; modal: ModalPom }>({
  grid: async ({ page, eventUtils }, use) => {
    await use(new GridPom(page, eventUtils));
  },
  modal: async ({ page, eventUtils }, use) => {
    await use(new ModalPom(page, eventUtils));
  },
});

const datasetName = getUniqueDatasetNameWithPrefix(`modal-multi-pcd`);

test.beforeAll(async ({ fiftyoneLoader }) => {
  await fiftyoneLoader.executePythonCode(`
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset(
        "quickstart-groups", dataset_name="${datasetName}", max_samples=3
    )
    dataset.persistent = True
    dataset.group_slice = "pcd"
    extra = dataset.first().copy()
    extra.group.name = "extra"
    dataset.add_sample(extra)`);
});

test.beforeEach(async ({ page, fiftyoneLoader }) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
});

test.describe("multi-pcd", () => {
  test("multi-pcd slice in modal", async ({ grid, modal }) => {
    await grid.openFirstSample();
    await modal.group.toggleMedia("carousel");
    await modal.group.toggleMedia("viewer");
    await modal.clickOnLooker3d();

    await modal.toggleLooker3dSlice("extra");

    await modal.sidebar.assert.verifySidebarEntryText("pcd-group.name", "pcd");
    await modal.sidebar.assert.verifySidebarEntryText(
      "extra-group.name",
      "extra"
    );

    await modal.toggleLooker3dSlice("pcd");

    await modal.sidebar.assert.verifySidebarEntryText("group.name", "extra");
  });
});
