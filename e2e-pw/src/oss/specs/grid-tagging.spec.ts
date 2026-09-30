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
  const filepath = (index: number) => path.join(mediaDir, `${index}.png`);
  const tile = (index: number) =>
    grid.locator.getByTestId("looker").filter({ hasText: filepath(index) });
  const tag = (index: number) => tile(index).getByTestId("tag-tags-grid-test");

  await grid.afterTagsRendered([filepath(0)], async () => {
    await sidebar.clickFieldCheckbox("filepath");
    await sidebar.clickFieldCheckbox("tags");
  });

  // Visit later pages before tagging so Relay already holds their old data.
  const visited = await grid.tagsRenderedMark();
  await grid.scrollBottom();
  await tile(30).scrollIntoViewIfNeeded();
  await grid.untilTagsRenderedSince(visited, filepath(30));
  expect(await tag(30).count()).toBe(0);

  const tagged = await grid.tagsRenderedMark();
  await grid.run(() => new SelectionTrayPom(page).tagSamples("grid-test"));

  // Check actual viewport contents, including previously cached later pages.
  for (const index of [0, 30, 47, 53]) {
    await tile(index).scrollIntoViewIfNeeded();
    await grid.untilTagsRenderedSince(tagged, filepath(index));
    expect(await tag(index).isVisible()).toBe(true);
  }
});
