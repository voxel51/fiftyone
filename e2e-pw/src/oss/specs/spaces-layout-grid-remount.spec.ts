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

test.beforeAll(async ({ fiftyoneLoader, foWebServer }) => {
  await foWebServer.startWebServer();
  await fiftyoneLoader.executePythonCode(`
    import fiftyone as fo
    dataset = fo.Dataset("${datasetName}")
    dataset.persistent = True
    dataset.add_samples([fo.Sample(filepath=f"{i}.png") for i in range(5)])
  `);
});

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test.beforeEach(async ({ fiftyoneLoader, page }) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
});

test("grid remounts exactly once per spaces layout change", async ({
  grid,
  page,
  panel,
}) => {
  // count every grid lifecycle event from here on; a redundant teardown
  // (e.g. a keyed remount of the space tree or a resize-induced spotlight
  // rebuild) shows up as extra counts before the mount we await
  type Counted = Window & {
    __gridLifecycle: { mount: number; unmount: number };
  };
  await page.evaluate(() => {
    const counts = { mount: 0, unmount: 0 };
    (window as unknown as Counted).__gridLifecycle = counts;
    document.addEventListener("grid-mount", () => {
      counts.mount++;
    });
    document.addEventListener("grid-unmount", () => {
      counts.unmount++;
    });
  });
  const counts = () =>
    page.evaluate(() => (window as unknown as Counted).__gridLifecycle);

  // split: a plain panel open places it side-by-side, splitting the layout
  const split = await grid.armGridRefresh();
  await panel.openInSplit("Histograms");
  await split.received;
  await expect(panel.getContent("Histograms")).toBeVisible();
  await expect(grid.getNthTile(0)).toBeVisible();
  expect(await counts()).toEqual({ mount: 1, unmount: 1 });

  // join: closing the split panel collapses the layout back to a single pane
  const join = await grid.armGridRefresh();
  await panel.closeTab("Histograms");
  await join.received;
  await expect(panel.getContent("Histograms")).toBeHidden();
  await expect(grid.getNthTile(0)).toBeVisible();
  expect(await counts()).toEqual({ mount: 2, unmount: 2 });
});
