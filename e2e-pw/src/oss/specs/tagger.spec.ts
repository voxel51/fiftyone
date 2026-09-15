import { test as base, expect } from "src/oss/fixtures";
import { GridTaggerPom } from "src/oss/poms/action-row/tagger/grid-tagger";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { SidebarPom } from "src/oss/poms/sidebar";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix("smoke-tagger");

// 21 labels in total; the first two samples carry unique per-sample counts
// (7 and 5) so their label-tag bubbles can be located
const SAMPLES = [
  {
    ground_truth: ["bird", "bird", "cat"],
    predictions: ["bird", "bird", "cat", "dog"],
  },
  { ground_truth: ["dog", "person"], predictions: ["dog", "person", "cat"] },
  { ground_truth: ["cat"], predictions: ["cat", "cat"] },
  { ground_truth: ["horse", "horse"], predictions: ["horse"] },
  { ground_truth: ["person"], predictions: ["person", "bird"] },
];

const test = base.extend<{
  grid: GridPom;
  modal: ModalPom;
  sidebar: SidebarPom;
  tagger: GridTaggerPom;
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
  tagger: async ({ page }, use) => {
    await use(new GridTaggerPom(page));
  },
});

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test.beforeAll(async ({ datasetFactory, foWebServer }) => {
  await foWebServer.startWebServer();

  await datasetFactory.createDetectionsDataset({
    datasetName,
    numbered: true,
    samples: SAMPLES.map(({ ground_truth, predictions }) => ({
      detections: {
        ground_truth,
        predictions: predictions.map((label) => ({ label, confidence: 0.9 })),
      },
    })),
  });
});

test.beforeEach(async ({ page, fiftyoneLoader }) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
});

test.describe.serial("tag", () => {
  test("sample tag and label tag loads correct aggregation number on default view", async ({
    grid,
    tagger,
  }) => {
    await grid.actionsRow.toggleTagSamplesOrLabels();
    await tagger.setActiveTaggerMode("sample");
    const placeHolder = await tagger.getTagInputTextPlaceholder("sample");
    expect(placeHolder.includes(" 5 ")).toBe(true);

    await tagger.setActiveTaggerMode("label");
    const placeHolder2 = await tagger.getTagInputTextPlaceholder("label");
    expect(placeHolder2.includes(" 21 ")).toBe(true);

    await grid.actionsRow.toggleTagSamplesOrLabels();
  });

  test("In grid, I can add a new sample tag to all samples", async ({
    grid,
    page,
    sidebar,
    tagger,
  }) => {
    await sidebar.clickFieldCheckbox("tags");
    await sidebar.clickFieldDropdown("tags");
    // mount eventListener
    const gridRefreshedEventPromise = await grid.armGridRefresh();

    await grid.actionsRow.toggleTagSamplesOrLabels();
    await tagger.setActiveTaggerMode("sample");
    await tagger.addNewTag("sample", "test1");

    await gridRefreshedEventPromise.received;

    const bubble = page.getByTestId("tag-tags-test1");
    await expect(bubble).toHaveCount(5);
  });

  test("In grid, I can add a new label tag to all samples", async ({
    aggregationWatcher,
    grid,
    page,
    sidebar,
    tagger,
  }) => {
    await sidebar.clickFieldCheckbox("_label_tags");
    await sidebar.clickFieldDropdown("_label_tags");
    // mount eventListener
    const gridRefreshedEventPromise = await grid.armGridRefresh();

    await grid.actionsRow.toggleTagSamplesOrLabels();
    await tagger.setActiveTaggerMode("label");
    await tagger.addNewTag("label", "labelTest");

    await gridRefreshedEventPromise.received;
    // verify the bubble in the image
    // the first sample has 7 labels, the second sample has 5
    const bubble1 = page.getByTestId("tag-_label_tags-labeltest:-7");
    const bubble2 = page.getByTestId("tag-_label_tags-labeltest:-5");
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

    await modal.looker.hover();

    await modal.tagger.toggleOpen();
    await modal.tagger.addLabelTag("correct");

    await modal.sidebar.clearGroupFilters("labels");
    await modal.hideControls();
    // TODO: FIX ME. MODAL SCREENSHOT COMPARISON IS OFF BY ONE-PIXEL
    // await expect(modal.looker).toHaveScreenshot("labels.png");
  });
});
