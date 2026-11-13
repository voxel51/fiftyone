import { test as base } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix(`sparse-groups-scene`);
const test = base.extend<{ grid: GridPom; modal: ModalPom }>({
  grid: async ({ eventUtils, page }, use) => {
    await use(new GridPom(page, eventUtils));
  },
  modal: async ({ eventUtils, page }, use) => {
    await use(new ModalPom(page, eventUtils));
  },
});

// group i (from 1) has an "ego" sample when i % 2, a "left" one when i % 3
// and a "right" one when i % 5
const NUM_GROUPS = 10;
const inGroups = (divisor: number) =>
  Array.from({ length: NUM_GROUPS }, (_, index) => index).filter(
    (index) => (index + 1) % divisor !== 0,
  );

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test.beforeAll(async ({ datasetFactory, foWebServer }) => {
  await foWebServer.startWebServer();
  await datasetFactory.createDataset({
    mediaType: "group",
    datasetName,
    numGroups: NUM_GROUPS,
    slices: [
      { name: "ego", mediaType: "point-cloud", groupIndices: inGroups(2) },
      { name: "left", mediaType: "image", groupIndices: inGroups(3) },
      { name: "right", mediaType: "image", groupIndices: inGroups(5) },
    ],
  });
});

test.beforeEach(async ({ page, fiftyoneLoader }) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
});

test(`ego default group slice transitions`, async ({ grid, modal }) => {
  await grid.assert.isEntryCountTextEqualTo(
    `${inGroups(2).length} groups with slice`,
  );
  await modal.afterGroupSampleLoaded(() => grid.openFirstSample());
  await modal.sidebar.toggleSidebarGroup("GROUP");
  await modal.sidebar.assert.verifySidebarEntryText("group.name", "ego");
  await modal.sidebar.afterEntryChanged("group.name", "ego", () =>
    modal.groupSampleCanvas.click(0.5, 0.5),
  );
  await modal.sidebar.assert.verifySidebarEntryText("group.name", "left");
  await modal.navigateSlice("group.name", "right", true);
  await modal.sidebar.assert.verifySidebarEntryText("group.name", "right");
  await modal.sidebar.afterEntryChanged("group.name", "right", () =>
    modal.sampleCanvas3d.click(0.5, 0.5),
  );
  await modal.sidebar.assert.verifySidebarEntryText("group.name", "ego");
  await modal.afterCarouselRendered(() => modal.navigateNextSample(true));
  await modal.assert.verifyCarouselLength(1);
  await modal.sidebar.assert.verifySidebarEntryText("group.name", "ego");
  await modal.sidebar.afterEntryChanged("group.name", "ego", () =>
    modal.groupSampleCanvas.click(0.5, 0.5),
  );
  await modal.sidebar.assert.verifySidebarEntryText("group.name", "right");
  await modal.afterCarouselRendered(() => modal.navigateNextSample(true));
  await modal.sidebar.assert.verifySidebarEntryText("group.name", "left");
  await modal.assert.verifyCarouselLength(1);
  await modal.close();
});
