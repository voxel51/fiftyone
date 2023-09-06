import { test as base } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const test = base.extend<{ grid: GridPom; modal: ModalPom }>({
  grid: async ({ page, eventUtils }, use) => {
    await use(new GridPom(page, eventUtils));
  },
  modal: async ({ page }, use) => {
    await use(new ModalPom(page));
  },
});

const datasetName = getUniqueDatasetNameWithPrefix(`sparse-dynamic-groups`);

test.beforeAll(async ({ fiftyoneLoader }) => {
  await fiftyoneLoader.executePythonCode(`
  import fiftyone as fo
  dataset = fo.Dataset("${datasetName}")
  dataset.persistent = True

  first = fo.Group()
  second = fo.Group()
  third = fo.Group()
  fourth = fo.Group()
  
  one = fo.Sample(
      filepath="one.png",
      group=first.element("left"),
      scene="a",
      frame=0,
  )
  two = fo.Sample(
      filepath="two.png",
      group=second.element("left"),
      scene="a",
      frame=1,
  )
  three = fo.Sample(
      filepath="three.png",
      group=third.element("right"),
      scene="b",
      frame=0,
  )
  four = fo.Sample(
      filepath="four.png",
      group=fourth.element("right"),
      scene="b",
      frame=1,
  )
  
  dataset.add_samples([one, two, three, four])
  view = dataset.group_by("scene", order_by="frame")
  dataset.save_view("group", view)
  `);
});

test(`left slice (default)`, async ({ fiftyoneLoader, page, grid, modal }) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName);

  const groupByRefresh = grid.getWaitForGridRefreshPromise();
  await grid.actionsRow.toggleCreateDynamicGroups();
  await grid.actionsRow.groupBy("scene", "frame");
  await groupByRefresh;
  await grid.assert.isEntryCountTextEqualTo("1 group with slice");
  await grid.openFirstSample();
  await modal.sidebar.toggleSidebarGroup("GROUP");
  await modal.sidebar.assert.verifySidebarEntryTexts({
    frame: "0",
    "group.name": "left",
    scene: "a",
  });
  await modal.group.dynamicGroupPagination.assert.verifyPage(2);
  await modal.group.dynamicGroupPagination.assert.verifyTooltips({
    1: "frame: 0",
    2: "frame: 1",
  });
  await modal.group.dynamicGroupPagination.navigatePage(2);
  await modal.sidebar.assert.verifySidebarEntryTexts({
    frame: "1",
    "group.name": "left",
    scene: "a",
  });
  await modal.close();
});

test(`right slice`, async ({ fiftyoneLoader, page, grid, modal }) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
    savedView: "group",
  });
  await grid.selectSlice("right");
  await grid.assert.isEntryCountTextEqualTo("1 group with slice");
  await grid.openFirstSample();
  await modal.sidebar.toggleSidebarGroup("GROUP");
  await modal.sidebar.assert.verifySidebarEntryTexts({
    frame: "0",
    "group.name": "right",
    scene: "b",
  });
  await modal.group.dynamicGroupPagination.assert.verifyPage(2);
  await modal.group.dynamicGroupPagination.assert.verifyTooltips({
    1: "frame: 0",
    2: "frame: 1",
  });
  await modal.group.dynamicGroupPagination.navigatePage(2);
  await modal.sidebar.assert.verifySidebarEntryTexts({
    frame: "1",
    "group.name": "right",
    scene: "b",
  });
  await modal.close();
});
