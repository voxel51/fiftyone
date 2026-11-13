import { test as base, expect } from "src/oss/fixtures";
import { GridActionsRowPom } from "src/oss/poms/action-row/grid-actions-row";
import { GridPom } from "src/oss/poms/grid";
import { SidebarPom } from "src/oss/poms/sidebar";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix(`group-filter-toPatches`);
const test = base.extend<{
  grid: GridPom;
  gridActionsRow: GridActionsRowPom;
  sidebar: SidebarPom;
}>({
  grid: async ({ eventUtils, page }, use) => {
    await use(new GridPom(page, eventUtils));
  },
  sidebar: async ({ page }, use) => {
    await use(new SidebarPom(page));
  },
  gridActionsRow: async ({ page }, use) => {
    await use(new GridActionsRowPom(page));
  },
});

// one "carrot" per sample, so one patch per group of the active slice
const NUM_GROUPS = 5;

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
      { name: "left", mediaType: "image" },
      { name: "right", mediaType: "image" },
    ],
    schema: { predictions: "Detections" },
    withSampleData: (_, { label }) => ({
      predictions: label.detections([
        label.detection({
          label: "carrot",
          confidence: 0.8,
          bounding_box: [0.1, 0.1, 0.2, 0.2],
        }),
        label.detection({
          label: "not-carrot",
          confidence: 0.25,
          bounding_box: [0.4, 0.4, 0.2, 0.2],
        }),
      ]),
    }),
  });
});

test.beforeEach(async ({ page, fiftyoneLoader }) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
});

test(`group dataset with filters converts toPatches correctly`, async ({
  page,
  grid,
  gridActionsRow,
  sidebar,
  eventUtils,
}) => {
  await grid.assert.isEntryCountTextEqualTo(`${NUM_GROUPS} groups with slice`);

  // apply a sidebar filter
  await eventUtils.after("animation-onRest", async () => {
    await sidebar.clickFieldDropdown("predictions");
  });

  await sidebar.applyLabelFromList(["carrot"], "select-detections-with-label");

  // convert to patches
  await grid.actionsRow.toggleToClipsOrPatches();
  await grid.afterEntryCounts(() =>
    grid.run(async () => {
      await gridActionsRow.clickToPatchesByLabelField("predictions");
    }),
  );

  // verify result:
  await grid.assert.isEntryCountTextEqualTo(`${NUM_GROUPS} patches`);

  // not-carrot should not be in the sidebar filter anymore
  await eventUtils.after("animation-onRest", async () => {
    await sidebar.clickFieldDropdown("predictions");
  });
  expect(await page.getByTestId("checkbox-not-carrot").count()).toEqual(0);
});
