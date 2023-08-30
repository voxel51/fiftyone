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

// todo: skipping pcd because slice navigation behavior is different
const extensionDatasetNamePairs = ["mp4", "png"].map(
  (extension) =>
    [
      extension,
      getUniqueDatasetNameWithPrefix(`${extension}-sparse-dynamic-groups`),
    ] as const
);

test.beforeAll(async ({ fiftyoneLoader }) => {
  let pythonCode = `
      import fiftyone as fo
  `;

  extensionDatasetNamePairs.forEach(([extension, datasetName]) => {
    pythonCode += `
      # ${extension} dataset
      dataset = fo.Dataset("${datasetName}")
      dataset.persistent = True

      first = fo.Group()
      second = fo.Group()
      third = fo.Group()
      fourth = fo.Group()
      
      one = fo.Sample(
          filepath="one.${extension}",
          group=first.element("left"),
          scene="a",
          frame=0,
      )
      two = fo.Sample(
          filepath="two.${extension}",
          group=second.element("left"),
          scene="a",
          frame=1,
      )
      three = fo.Sample(
          filepath="three.${extension}",
          group=third.element("right"),
          scene="b",
          frame=0,
      )
      four = fo.Sample(
          filepath="four.${extension}",
          group=fourth.element("right"),
          scene="b",
          frame=1,
      )
      
      dataset.add_samples([one, two, three, four])
      view = dataset.group_by("scene", order_by="frame")
      dataset.save_view("group", view)
      `;
  });
  await fiftyoneLoader.executePythonCode(pythonCode);
});

extensionDatasetNamePairs.forEach(([extension, datasetName]) => {
  test(`${extension} default slice`, async ({
    fiftyoneLoader,
    page,
    grid,
    modal,
  }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
      savedView: "group",
    });
    await grid.assert.isEntryCountTextEqualTo("1 group with slice");
    await grid.openFirstSample();
    await modal.sidebar.toggleSidebarGroup("GROUP");
    await modal.sidebar.assert.verifySidebarEntryText("group.name", "left");
    await modal.sidebar.assert.verifySidebarEntryText("scene", "a");
    await modal.sidebar.assert.verifySidebarEntryText("frame", "0");
    await modal.group.dynamicGroupPagination.assert.verifyPage(2);
    await modal.group.dynamicGroupPagination.assert.verifyTooltip(
      1,
      "frame: 0"
    );
    await modal.group.dynamicGroupPagination.assert.verifyTooltip(
      2,
      "frame: 1"
    );
    await modal.group.dynamicGroupPagination.navigatePage(2);
    await modal.sidebar.assert.verifySidebarEntryText("group.name", "left");
    await modal.sidebar.assert.verifySidebarEntryText("scene", "a");
    await modal.sidebar.assert.verifySidebarEntryText("frame", "1");
    await modal.close();
  });

  test(`${extension} right slice`, async ({
    fiftyoneLoader,
    page,
    grid,
    modal,
  }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
      savedView: "group",
    });
    await grid.selectSlice("right");
    await grid.assert.isEntryCountTextEqualTo("1 group with slice");
    await grid.openFirstSample();
    await modal.sidebar.toggleSidebarGroup("GROUP");
    await modal.sidebar.assert.verifySidebarEntryText("group.name", "right");
    await modal.sidebar.assert.verifySidebarEntryText("scene", "b");
    await modal.sidebar.assert.verifySidebarEntryText("frame", "0");
    await modal.group.dynamicGroupPagination.assert.verifyPage(2);
    await modal.group.dynamicGroupPagination.assert.verifyTooltip(
      1,
      "frame: 0"
    );
    await modal.group.dynamicGroupPagination.assert.verifyTooltip(
      2,
      "frame: 1"
    );
    await modal.group.dynamicGroupPagination.navigatePage(2);
    await modal.sidebar.assert.verifySidebarEntryText("group.name", "right");
    await modal.sidebar.assert.verifySidebarEntryText("scene", "b");
    await modal.sidebar.assert.verifySidebarEntryText("frame", "1");
    await modal.close();
  });
});
