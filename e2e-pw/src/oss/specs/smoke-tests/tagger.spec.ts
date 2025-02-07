import { test as base, expect } from "src/oss/fixtures";
import { GridTaggerPom } from "src/oss/poms/action-row/tagger/grid-tagger";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { SidebarPom } from "src/oss/poms/sidebar";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix("smoke-quickstart");

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

test.beforeAll(async ({ fiftyoneLoader, foWebServer }) => {
  await foWebServer.startWebServer();
  await fiftyoneLoader.loadZooDataset("quickstart", datasetName, {
    max_samples: 5,
  });
});

test.beforeEach(async ({ page, fiftyoneLoader, sidebar }) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
  await sidebar.clickFieldCheckbox("ground_truth");
  await sidebar.clickFieldCheckbox("predictions");
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
    expect(placeHolder2.includes(" 143 ")).toBe(true);

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
    const gridRefreshedEventPromise = grid.getWaitForGridRefreshPromise();

    await grid.actionsRow.toggleTagSamplesOrLabels();
    await tagger.setActiveTaggerMode("sample");
    await tagger.addNewTag("sample", "test1");

    await gridRefreshedEventPromise;

    const bubble = page.getByTestId("tag-tags-test1");
    await expect(bubble).toHaveCount(5);
  });

  test("In grid, I can add a new label tag to all samples", async ({
    grid,
    page,
    sidebar,
    tagger,
  }) => {
    await sidebar.clickFieldCheckbox("_label_tags");
    await sidebar.clickFieldDropdown("_label_tags");
    // mount eventListener
    const gridRefreshedEventPromise = grid.getWaitForGridRefreshPromise();

    await grid.actionsRow.toggleTagSamplesOrLabels();
    await tagger.setActiveTaggerMode("label");
    await tagger.addNewTag("label", "labelTest");

    await gridRefreshedEventPromise;
    // verify the bubble in the image
    // the first sample has 17 label tag count, the second sample has 22 tag count
    const bubble1 = page.getByTestId("tag-_label_tags-labeltest:-17");
    const bubble2 = page.getByTestId("tag-_label_tags-labeltest:-22");
    await expect(bubble1).toBeVisible();
    await expect(bubble2).toBeVisible();
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

    const entryExpandPromise = eventUtils.getEventReceivedPromiseForPredicate(
      "animation-onRest",
      () => true
    );
    await modal.sidebar.clickFieldDropdown("predictions");
    await entryExpandPromise;
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
