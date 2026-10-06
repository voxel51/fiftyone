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

// more than one page of grid tiles and of carousel items
const NUM_SAMPLES = 21;
const LAST = String(NUM_SAMPLES - 1);

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test.beforeAll(async ({ datasetFactory, foWebServer }) => {
  await foWebServer.startWebServer();
  await datasetFactory.createDataset({
    datasetName,
    numSamples: NUM_SAMPLES,
    schema: { group: "IntField" },
    withSampleData: () => ({ group: 1 }),
    savedViews: { group: 'dataset.group_by("group", order_by="index")' },
  });
  await datasetFactory.createDataset({
    mediaType: "group",
    datasetName: groupDatasetName,
    numGroups: 1,
    slices: Array.from({ length: NUM_SAMPLES }, (_, index) => ({
      name: String(index),
      mediaType: "image" as const,
    })),
  });
});

test.describe.serial("grid page", () => {
  test(`grid has correct second page (all ${NUM_SAMPLES} samples)`, async ({
    fiftyoneLoader,
    grid,
    page,
  }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
    await grid.assert.isTileCountEqualTo(NUM_SAMPLES);
  });

  test(`modal group carousel has correct second page (all ${NUM_SAMPLES} samples)`, async ({
    fiftyoneLoader,
    grid,
    modal,
    page,
  }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, groupDatasetName);
    await modal.afterCarouselRendered(() => grid.openFirstSample());
    await modal.sidebar.toggleSidebarGroup("GROUP");
    await modal.scrollCarouselTo(LAST);
    await modal.navigateSlice("group.name", LAST, true);
    await modal.sidebar.assert.verifySidebarEntryText("group.name", LAST);
  });

  test(`modal dynamic group carousel has correct second page (all ${NUM_SAMPLES} samples)`, async ({
    fiftyoneLoader,
    grid,
    modal,
    page,
  }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
      searchParams: new URLSearchParams({ view: "group" }),
    });
    await grid.openFirstSample();
    await modal.afterCarouselRendered(() =>
      modal.group.setDynamicGroupsNavigationMode("carousel"),
    );
    await modal.scrollCarouselTo(LAST);
    await modal.navigateSlice("index", LAST, true);
    await modal.sidebar.assert.verifySidebarEntryText("index", LAST);
  });
});
