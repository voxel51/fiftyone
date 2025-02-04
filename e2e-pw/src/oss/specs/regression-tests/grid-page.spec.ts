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

const datasetName = getUniqueDatasetNameWithPrefix("grid-page");
const groupDatasetName = getUniqueDatasetNameWithPrefix("grid-page-group");

test.beforeAll(async ({ fiftyoneLoader }) => {
  await fiftyoneLoader.executePythonCode(`
    import fiftyone as fo

    dataset = fo.Dataset("${datasetName}")
    dataset.persistent = True
    dataset.add_samples([fo.Sample(filepath=f"{i}.png", group=1, i=i) for i in range(0, 21)])

    view = dataset.group_by("group", order_by="i")
    dataset.save_view("group", view)

    group_dataset = fo.Dataset("${groupDatasetName}")
    group_dataset.persistent = True
    group_dataset.add_group_field("group")
    group_samples = []
    group = fo.Group()
    for i in range(0, 21):
        group_samples.append(fo.Sample(filepath=f"{i}.png", group=group.element(str(i))))

    group_dataset.add_samples(group_samples)
  `);
});

test("grid has correct second page (all 21 samples)", async ({
  fiftyoneLoader,
  grid,
  page,
}) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
  await grid.assert.isLookerCountEqualTo(21);
});

test("modal group carousel has correct second page (all 21 samples)", async ({
  fiftyoneLoader,
  grid,
  modal,
  page,
}) => {
  await fiftyoneLoader.waitUntilGridVisible(page, groupDatasetName);
  await grid.openFirstSample();
  await modal.sidebar.toggleSidebarGroup("GROUP");
  await modal.waitForCarouselToLoad();
  await modal.scrollCarousel();
  await modal.navigateSlice("group.name", "20", true);
  await modal.sidebar.assert.verifySidebarEntryText("group.name", "20");
});

test("modal dynamic group carousel has correct second page (all 21 samples)", async ({
  fiftyoneLoader,
  grid,
  modal,
  page,
}) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
    searchParams: new URLSearchParams({ view: "group" }),
  });
  await grid.openFirstSample();
  await modal.group.setDynamicGroupsNavigationMode("carousel");
  await modal.waitForCarouselToLoad();
  await modal.scrollCarousel();
  await modal.navigateSlice("i", "20", true);
  await modal.sidebar.assert.verifySidebarEntryText("i", "20");
});
