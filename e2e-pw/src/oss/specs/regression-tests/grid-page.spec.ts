import { test as base } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const test = base.extend<{ grid: GridPom; modal: ModalPom }>({
  grid: async ({ page }, use) => {
    await use(new GridPom(page));
  },
  modal: async ({ page }, use) => {
    await use(new ModalPom(page));
  },
});

const datasetName = getUniqueDatasetNameWithPrefix("grid-page");

test.beforeAll(async ({ fiftyoneLoader }) => {
  await fiftyoneLoader.executePythonCode(`
    import fiftyone as fo

    dataset = fo.Dataset("${datasetName}")
    dataset.persistent = True
    dataset.add_samples([fo.Sample(filepath=f"{i}.png", group=1, i=i) for i in range(0, 21)])

    view = dataset.group_by("group", order_by="i")
    dataset.save_view("group", view)
  `);
});

test("grid has correct second page (all 21 samples)", async ({
  page,
  fiftyoneLoader,
  grid,
}) => {
  await fiftyoneLoader.waitUntilLoad(page, datasetName);
  await grid.assert.assertNLookers(21);
});

test("modal carousel has correct second page (all 21 samples)", async ({
  page,
  fiftyoneLoader,
  modal,
  grid,
}) => {
  await fiftyoneLoader.waitUntilLoad(page, datasetName, "group");
  await grid.openFirstLooker();
  await modal.waitForCarouselToLoad();
  await modal.scrollCarousel();
  await modal.navigateSlice("i", "20", true);
  await modal.sidebar.assert.verifySidebarEntryText("i", "20");
});
