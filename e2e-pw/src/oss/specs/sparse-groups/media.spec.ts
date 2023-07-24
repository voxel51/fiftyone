import { test as base } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

["mp4", "pcd", "png"].forEach((extension) => {
  const datasetName = getUniqueDatasetNameWithPrefix(
    `${extension}-sparse-groups`
  );
  const test = base.extend<{ grid: GridPom; modal: ModalPom }>({
    grid: async ({ page }, use) => {
      await use(new GridPom(page));
    },
    modal: async ({ page }, use) => {
      await use(new ModalPom(page));
    },
  });

  test.beforeAll(async ({ fiftyoneLoader }) => {
    await fiftyoneLoader.executePythonCode(`
    import fiftyone as fo
    dataset = fo.Dataset("${datasetName}")
    dataset.add_group_field("group", default="first")
    dataset.persistent = True

    first_group = fo.Group()
    first = fo.Sample(filepath="first.${extension}", group=first_group.element("first"))
    first_shared = fo.Sample(filepath="shared.${extension}", group=first_group.element("shared"))

    second_group = fo.Group()
    second = fo.Sample(
        filepath="second.${extension}", group=second_group.element("second")
    )
    second_shared = fo.Sample(filepath="shared.${extension}", group=second_group.element("shared"))

    dataset.add_samples([first, first_shared, second, second_shared])`);
  });

  test.beforeEach(async ({ page, fiftyoneLoader }) => {
    await fiftyoneLoader.waitUntilLoad(page, datasetName);
  });

  test(`${extension} default slice`, async ({ grid, modal, page }) => {
    await grid.assert.waitForEntryCountTextToEqual("1 group");
    await grid.openFirstLooker();
    await modal.sidebarPom.toggleSidebarGroup("GROUP");
    await modal.sidebarPom.assert.verifySidebarEntryText("group.name", "first");
    await modal.navigateSlice("group", "shared", true);
    await modal.sidebarPom.assert.verifySidebarEntryText(
      "group.name",
      "shared"
    );
    await modal.close();
  });

  test(`${extension} shared slice`, async ({ grid, modal }) => {
    await grid.assert.waitForEntryCountTextToEqual("1 group");
    await grid.selectSlice("shared");
    await grid.assert.waitForEntryCountTextToEqual("2 groups");
    await grid.openFirstLooker();
    await modal.sidebarPom.assert.verifySidebarEntryText(
      "group.name",
      "shared"
    );
    await modal.sidebarPom.toggleSidebarGroup("GROUP");
    await modal.navigateSlice("group", "first", true);
    await modal.sidebarPom.assert.verifySidebarEntryText("group.name", "first");
    await modal.navigateNextSample(true);
    await modal.sidebarPom.assert.verifySidebarEntryText(
      "group.name",
      "shared"
    );
    await modal.navigateSlice("group", "second", true);
    await modal.sidebarPom.assert.verifySidebarEntryText(
      "group.name",
      "second"
    );
    await modal.navigatePreviousSample(true);
    await modal.sidebarPom.assert.verifySidebarEntryText(
      "group.name",
      "shared"
    );
    await modal.navigateSlice("group", "first", true);
    await modal.sidebarPom.assert.verifySidebarEntryText("group.name", "first");
    await modal.close();
  });

  test(`${extension} second slice`, async ({ grid, modal }) => {
    await grid.assert.waitForEntryCountTextToEqual("1 group");
    await grid.selectSlice("second");
    await grid.assert.waitForEntryCountTextToEqual("1 group");
    await modal.sidebarPom.toggleSidebarGroup("GROUP");
    await modal.sidebarPom.assert.verifySidebarEntryText(
      "group.name",
      "second"
    );
    await modal.navigateSlice("group", "shared", true);
    await modal.sidebarPom.assert.verifySidebarEntryText(
      "group.name",
      "shared"
    );
    await modal.close();
  });
});
