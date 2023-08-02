import { test as base } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix(`sparse-groups-scene`);
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
    dataset.add_group_field("group", default="ego")
    dataset.persistent = True


    samples = []
    for i in range(1, 101):
        group = fo.Group()
    
        if i % 2:
            samples.append(
                fo.Sample(
                    filepath=f"ego-{i}.pcd", group=group.element("ego"), dynamic=i % 10
                )
            )
    
        if i % 3:
            samples.append(
                fo.Sample(
                    filepath=f"left-{i}.png", group=group.element("left"), dynamic=i % 10
                )
            )
    
        if i % 5:
            samples.append(
                fo.Sample(
                    filepath=f"right-{i}.png", group=group.element("right"), dynamic=i % 10
                )
            )
    dataset.add_samples(samples)
    dataset.save_view("dynamic", dataset.group_by("dynamic", order_by="id"))`);
});

test.beforeEach(async ({ page, fiftyoneLoader }) => {
  await fiftyoneLoader.waitUntilLoad(page, datasetName);
});

test(`ego default group slice transitions`, async ({ grid, modal }) => {
  await grid.assert.waitForEntryCountTextToEqual("50 groups with slice");
  await grid.openFirstLooker();
  await modal.sidebar.toggleSidebarGroup("GROUP");
  await modal.sidebar.assert.verifySidebarEntryText("group.name", "ego");
  await modal.clickOnLooker();
  await modal.sidebar.assert.verifySidebarEntryText("group.name", "left");
  await modal.navigateSlice("group", "right", true);
  await modal.sidebar.assert.verifySidebarEntryText("group.name", "right");
  await modal.clickOnLooker3d();
  await modal.sidebar.assert.verifySidebarEntryText("group.name", "ego");
  await modal.navigateNextSample(true);
  await modal.sidebar.assert.verifySidebarEntryText("group.name", "ego");
  await modal.clickOnLooker();
  await modal.sidebar.assert.verifySidebarEntryText("group.name", "right");
  await modal.assert.verifyCarouselLength(1);
  await modal.navigateNextSample(true);
  await modal.sidebar.assert.verifySidebarEntryText("group.name", "left");
  await modal.assert.verifyCarouselLength(1);
  await modal.close();
});
