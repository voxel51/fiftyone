import { test as base } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix("sparse-groups");

const test = base.extend<{ grid: GridPom; modal: ModalPom }>({
  grid: async ({ page }, use) => {
    await use(new GridPom(page));
  },
  modal: async ({ page }, use) => {
    await use(new ModalPom(page));
  },
});

test.beforeAll(async ({ fiftyoneLoader }) => {
  await fiftyoneLoader.loadSparseGroupsImageDataset(datasetName);
});

test.beforeEach(async ({ page, fiftyoneLoader }) => {
  await fiftyoneLoader.waitUntilLoad(page, datasetName);
});

test("default slice", async ({ grid, modal, page }) => {
  await grid.assert.waitForEntryCountTextToEqual("1 group");
  await grid.openFirstLooker();
  await modal.sidebarPom.toggleSidebarGroup("GROUP");
  await modal.sidebarPom.assert.verifySidebarEntryText("group.name", "first");
  await modal.navigateSlice("group", "shared");
  await modal.sidebarPom.assert.verifySidebarEntryText("group.name", "shared");
  await modal.close();
});

test("shared slice", async ({ grid, modal, page }) => {
  await grid.assert.waitForEntryCountTextToEqual("1 group");
  await grid.selectSlice("shared");
  await grid.assert.waitForEntryCountTextToEqual("2 groups");
  await grid.openFirstLooker();
  await modal.sidebarPom.assert.verifySidebarEntryText("group.name", "shared");
  await modal.sidebarPom.toggleSidebarGroup("GROUP");
  await modal.navigateSlice("group", "first", true);
  await modal.sidebarPom.assert.verifySidebarEntryText("group.name", "first");
  await modal.navigateNextSample(true);
  await modal.sidebarPom.assert.verifySidebarEntryText("group.name", "shared");
  await modal.navigateSlice("group", "second", true);
  await modal.sidebarPom.assert.verifySidebarEntryText("group.name", "second");
  await modal.navigatePreviousSample(true);
  await modal.sidebarPom.assert.verifySidebarEntryText("group.name", "shared");
  await modal.navigateSlice("group", "first", true);
  await modal.sidebarPom.assert.verifySidebarEntryText("group.name", "first");
});
