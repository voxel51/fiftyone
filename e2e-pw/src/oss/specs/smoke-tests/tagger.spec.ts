import { test as base, expect } from "src/oss/fixtures";
import { GridActionsRowPom } from "src/oss/poms/action-row/grid-actions-row";
import { TaggerPom } from "src/oss/poms/action-row/tagger";
import { GridPom } from "src/oss/poms/grid";
import { SidebarPom } from "src/oss/poms/sidebar";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix("smoke-quickstart");

const test = base.extend<{
  tagger: TaggerPom;
  sidebar: SidebarPom;
  grid: GridPom;
  gridActionsRow: GridActionsRowPom;
}>({
  tagger: async ({ page }, use) => {
    await use(new TaggerPom(page));
  },
  sidebar: async ({ page }, use) => {
    await use(new SidebarPom(page));
  },
  grid: async ({ page }, use) => {
    await use(new GridPom(page));
  },
  gridActionsRow: async ({ page }, use) => {
    await use(new GridActionsRowPom(page));
  },
});

test.describe("tag", () => {
  test.beforeAll(async ({ fiftyoneLoader }) => {
    await fiftyoneLoader.loadZooDataset("quickstart", datasetName, {
      max_samples: 5,
    });
  });

  test.beforeEach(async ({ page, fiftyoneLoader }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
  });

  test("sample tag and label tag loads correct aggregation number on default view", async ({
    tagger,
    gridActionsRow,
  }) => {
    await gridActionsRow.toggleTagSamplesOrLabels();
    await tagger.setActiveTaggerMode("sample");
    const placeHolder = await tagger.getTagInputTextPlaceholder("sample");
    expect(placeHolder.includes(" 5 ")).toBe(true);

    await tagger.setActiveTaggerMode("label");
    const placeHolder2 = await tagger.getTagInputTextPlaceholder("label");
    expect(placeHolder2.includes(" 143 ")).toBe(true);

    await gridActionsRow.toggleTagSamplesOrLabels();
  });

  test("In grid, I can add a new sample tag to all new samples", async ({
    page,
    tagger,
    sidebar,
    gridActionsRow,
    eventUtils,
  }) => {
    await sidebar.clickFieldCheckbox("tags");
    await sidebar.clickFieldDropdown("tags");
    // mount eventListener
    const gridRefreshedEventPromise =
      eventUtils.getEventReceivedPromiseForPredicate(
        "flashlight-refreshing",
        () => true
      );

    await gridActionsRow.toggleTagSamplesOrLabels();
    await tagger.setActiveTaggerMode("sample");
    await tagger.addNewTag("sample", "test1");

    await gridRefreshedEventPromise;

    const bubble = page.getByTestId("tag-tags-test1");
    await expect(bubble).toHaveCount(5);
  });

  test("In grid, I can add a new label tag to all new samples", async ({
    page,
    tagger,
    sidebar,
    eventUtils,
    gridActionsRow,
  }) => {
    await sidebar.clickFieldCheckbox("_label_tags");
    await sidebar.clickFieldDropdown("_label_tags");
    // mount eventListener
    const gridRefreshedEventPromise =
      eventUtils.getEventReceivedPromiseForPredicate(
        "flashlight-refreshing",
        () => true
      );

    await gridActionsRow.toggleTagSamplesOrLabels();
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
});
