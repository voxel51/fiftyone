/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Asserts that the grid tears down and remounts exactly once per spaces
 * layout change (opening a panel side-by-side, closing a split panel).
 *
 * Regression guard: the spotlight memo keyed on the identities of its
 * callables, so state updates riding along with a layout change (e.g. panel
 * loading status) could destroy and recreate the grid after it had already
 * loaded, flashing the loading animation a second time.
 */
import { test as base, expect } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { GridPanelPom } from "src/oss/poms/panels/grid-panel";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix(
  "spaces-layout-grid-remount",
);

const test = base.extend<{ grid: GridPom; panel: GridPanelPom }>({
  grid: async ({ page, eventUtils }, use) => {
    await use(new GridPom(page, eventUtils));
  },
  panel: async ({ page }, use) => {
    await use(new GridPanelPom(page));
  },
});

test.beforeAll(async ({ datasetFactory, foWebServer }) => {
  await foWebServer.startWebServer();
  await datasetFactory.createDataset({ datasetName, numSamples: 5 });
});

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test("grid remounts exactly once per spaces layout change", async ({
  fiftyoneLoader,
  grid,
  page,
  panel,
}) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
  await grid.assert.hasLifecycleCounts(1, 0);

  // split: a plain panel open places it side-by-side, splitting the layout
  const split = await grid.armGridRefresh();
  await panel.openInSplit("Histograms");
  await split.received;
  await expect(panel.getContent("Histograms")).toBeVisible();
  await expect(grid.getNthTile(0)).toBeVisible();
  await grid.assert.hasLifecycleCounts(2, 1);

  // join: closing the split panel collapses the layout back to a single pane
  const join = await grid.armGridRefresh();
  await panel.closeTab("Histograms");
  await join.received;
  await expect(panel.getContent("Histograms")).toBeHidden();
  await expect(grid.getNthTile(0)).toBeVisible();
  await grid.assert.hasLifecycleCounts(3, 2);
});
