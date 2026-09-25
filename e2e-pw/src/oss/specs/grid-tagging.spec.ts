import { rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test as base, expect } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { SelectionTrayPom } from "src/oss/poms/selection-tray";
import { SidebarPom } from "src/oss/poms/sidebar";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const test = base.extend<{
  grid: GridPom;
  sidebar: SidebarPom;
}>({
  grid: async ({ page, eventUtils }, use) => {
    await use(new GridPom(page, eventUtils));
  },
  sidebar: async ({ page }, use) => {
    await use(new SidebarPom(page));
  },
});

const datasetName = getUniqueDatasetNameWithPrefix("grid-tagging");
const mediaDir = path.join(os.tmpdir(), datasetName);

test.afterAll(async ({ fiftyoneLoader, foWebServer }) => {
  try {
    await fiftyoneLoader.executePythonCode(`
      import fiftyone as fo
      if fo.dataset_exists("${datasetName}"):
          fo.delete_dataset("${datasetName}")
    `);
  } finally {
    await foWebServer.stopWebServer();
    await rm(mediaDir, { recursive: true, force: true });
  }
});

test.beforeAll(async ({ datasetFactory, foWebServer }) => {
  await foWebServer.startWebServer();
  await datasetFactory.createDataset({ datasetName, numSamples: 100 });
});

test("grid tagging refreshes visible tiles across pages without reloading", async ({
  fiftyoneLoader,
  grid,
  page,
  sidebar,
}) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
  await sidebar.clickFieldCheckbox("filepath");
  await sidebar.clickFieldCheckbox("tags");
  const tile = (index: number) =>
    grid.locator.getByTestId("looker").filter({
      hasText: path.join(mediaDir, `${index}.png`),
    });

  // Visit later pages before tagging so Relay already holds their old data.
  await grid.scrollBottom();
  await tile(30).scrollIntoViewIfNeeded();
  await expect(tile(30)).toBeInViewport();
  await expect(tile(30).getByTestId("tag-tags-grid-test")).toBeHidden();

  await grid.run(() => new SelectionTrayPom(page).tagSamples("grid-test"));

  // Check actual viewport contents, including previously cached later pages.
  // toBeVisible alone also accepts tiles retained outside the viewport.
  for (const index of [0, 30, 47, 53]) {
    await tile(index).scrollIntoViewIfNeeded();
    await expect(tile(index)).toBeInViewport();
    await expect(tile(index).getByTestId("tag-tags-grid-test")).toBeVisible();
  }
});
