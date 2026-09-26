import { test as base, expect } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { SelectionTrayPom } from "src/oss/poms/selection-tray";
import { SidebarPom } from "src/oss/poms/sidebar";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix("smoke-quickstart");

const test = base.extend<{
  grid: GridPom;
  modal: ModalPom;
  sidebar: SidebarPom;
  tray: SelectionTrayPom;
}>({
  grid: async ({ page, eventUtils }, use) => {
    await use(new GridPom(page, eventUtils));
  },
  modal: async ({ page, eventUtils }, use) => {
    await use(new ModalPom(page, eventUtils));
  },
  sidebar: async ({ page }, use) => {
    await use(new SidebarPom(page));
  },
  tray: async ({ page }, use) => {
    await use(new SelectionTrayPom(page));
  },
});

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test.beforeAll(async ({ fiftyoneLoader, foWebServer }) => {
  await foWebServer.startWebServer();

  await fiftyoneLoader.loadZooDataset("quickstart", datasetName, {
    max_samples: 5,
  });
});

test.beforeEach(async ({ page, fiftyoneLoader }) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
});

test.describe.serial("tag", () => {
  test("tag picker offers sample and label targets on the default view", async ({
    page,
    tray,
  }) => {
    await tray.openTagPicker();
    await expect(page.getByText("Tag all 5 samples in view")).toBeVisible();
    await page.getByRole("radio", { name: "Labels" }).click();
    await expect(page.getByRole("radio", { name: "Labels" })).toBeChecked();
    await tray.closeTagPicker();
  });

  test("In grid, I can add a new sample tag to all samples", async ({
    grid,
    page,
    sidebar,
    tray,
  }) => {
    await sidebar.clickFieldCheckbox("tags");
    await sidebar.clickFieldDropdown("tags");
    // mount eventListener
    const gridRefreshedEventPromise = await grid.armGridRefresh();

    await tray.tagSamples("test1");

    await gridRefreshedEventPromise.received;

    const bubble = page.getByTestId("tag-tags-test1");
    await expect(bubble).toHaveCount(5);
  });

  test("In grid, I can add a new label tag to all samples", async ({
    aggregationWatcher,
    grid,
    page,
    sidebar,
    tray,
  }) => {
    await sidebar.clickFieldCheckbox("_label_tags");
    await sidebar.clickFieldDropdown("_label_tags");
    // mount eventListener
    const gridRefreshedEventPromise = await grid.armGridRefresh();

    await tray.tagLabels("labelTest");

    await gridRefreshedEventPromise.received;
    // verify the bubble in the image
    // the first sample has 17 label tag count, the second sample has 22 tag count
    const bubble1 = page.getByTestId("tag-_label_tags-labeltest:-17");
    const bubble2 = page.getByTestId("tag-_label_tags-labeltest:-22");
    await expect(bubble1).toBeVisible();
    await expect(bubble2).toBeVisible();

    // `_label_tags` is a client-derived pseudo path; the server has no such
    // field on the view and throws `DatasetView has no field '_label_tags'`
    // if it ever appears in an aggregations form. Full-view label-tag counts
    // come from per-label-field `.tags` aggregations (via cumulativeCounts).
    expect(
      aggregationWatcher.allPaths(),
      "aggregationsQuery must never request '_label_tags'",
    ).not.toContain("_label_tags");
  });

  test("In modal, I can add a label tag to a filtered sample", async ({
    eventUtils,
    grid,
    modal,
  }) => {
    await grid.openFirstSample();

    await modal.sidebar.toggleLabelCheckbox("ground_truth");
    await modal.hideControls();

    // TODO: FIX ME. MODAL SCREENSHOT COMPARISON IS OFF BY ONE-PIXEL
    // await expect(modal.looker).toHaveScreenshot("labels.png");

    const entryExpandPromise = await eventUtils.arm("animation-onRest");
    await modal.sidebar.clickFieldDropdown("predictions");
    await entryExpandPromise.received;
    await modal.sidebar.applyFilter("bird");
    await expect(
      modal.sidebar.locator.getByTestId("clear-filters-labels"),
    ).toBeVisible();

    await modal.looker.hover();

    await modal.tagger.toggleOpen();
    await modal.tagger.addLabelTag("correct");

    await modal.sidebar.clearGroupFilters("labels");
    await modal.hideControls();
    // TODO: FIX ME. MODAL SCREENSHOT COMPARISON IS OFF BY ONE-PIXEL
    // await expect(modal.looker).toHaveScreenshot("labels.png");
  });
});
