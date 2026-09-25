/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Asserts that the grid survives spaces layout changes (opening a panel
 * side-by-side, closing a split panel) without tearing down.
 *
 * Regression guard, twice over: the spotlight memo once keyed on the
 * identities of its callables, so state updates riding along with a layout
 * change (e.g. panel loading status) could destroy and recreate the grid
 * after it had already loaded; later, width changes themselves destroyed and
 * rebuilt the grid, refetching pages and media. The grid now relayouts in
 * place on resize — a layout change must produce zero unmounts and zero
 * additional mounts.
 */
import { test as base, expect } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { GridPanelPom } from "src/oss/poms/panels/grid-panel";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix(
  "spaces-layout-grid-remount",
);

// covers the grid's post-resize settle render (250ms) plus headroom, so a
// late teardown would be observed rather than racing the counter read
const LAYOUT_SETTLE_MS = 1_000;

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

test("grid survives spaces layout changes without remounting", async ({
  fiftyoneLoader,
  grid,
  page,
  panel,
}) => {
  // counters install at document start, so the initial page load's single
  // grid mount is always observed — arming after load would race it
  const { mounts, unmounts } = await grid.armLifecycleCounters();
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName);

  const assertNoRefresh = async (context: Record<string, number>) => {
    await page.waitForTimeout(LAYOUT_SETTLE_MS);
    const message = JSON.stringify({
      ...context,
      mounts: await mounts.timeline(),
      unmounts: await unmounts.timeline(),
    });
    // the initial page-load mount is the only mount, ever
    expect(await mounts.read(), message).toBe(1);
    expect(await unmounts.read(), message).toBe(0);
  };

  const now = () => page.evaluate(() => performance.now());

  // split: a plain panel open places it side-by-side, splitting the layout
  const splitAt = await now();
  await panel.openInSplit("Histograms");
  await expect(panel.getContent("Histograms")).toBeVisible();
  await expect(grid.getNthTile(0)).toBeVisible();
  await assertNoRefresh({ splitAt });

  // join: closing the split panel collapses the layout back to a single pane
  const joinAt = await now();
  await panel.closeTab("Histograms");
  await expect(panel.getContent("Histograms")).toBeHidden();
  await expect(grid.getNthTile(0)).toBeVisible();
  await assertNoRefresh({ splitAt, joinAt });
});
