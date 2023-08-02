import { test as base, expect } from "src/oss/fixtures";
import { TaggerPom } from "src/oss/poms/action-row/tagger";
import { GridPom } from "src/oss/poms/grid";
import { SidebarPom } from "src/oss/poms/sidebar";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix("smoke-quickstart");

const test = base.extend<{
  tagger: TaggerPom;
  sidebar: SidebarPom;
  grid: GridPom;
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
});

test.describe("tag", () => {
  test.beforeAll(async ({ fiftyoneLoader }) => {
    await fiftyoneLoader.loadZooDataset("quickstart", datasetName, {
      max_samples: 5,
    });
  });

  test.beforeEach(async ({ page, fiftyoneLoader }) => {
    await fiftyoneLoader.waitUntilLoad(page, datasetName);
  });

  test("sample tag and label tag loads correct aggregation number on default view", async ({
    tagger,
  }) => {
    await tagger.clickTagger();
    await tagger.setActiveTaggerMode("sample");
    const placeHolder = await tagger.getTagInputTextPlaceholder("sample");
    expect(placeHolder.includes(" 5 ")).toBe(true);

    await tagger.setActiveTaggerMode("label");
    const placeHolder2 = await tagger.getTagInputTextPlaceholder("label");
    expect(placeHolder2.includes(" 143 ")).toBe(true);

    await tagger.clickTagger();
  });

  test("In grid, I can add a new sample tag to all new samples", async ({
    page,
    tagger,
    sidebar,
    grid,
  }) => {
    await sidebar.clickFieldCheckbox("tags");
    await sidebar.clickFieldDropdown("tags");

    await tagger.clickTagger();
    await tagger.setActiveTaggerMode("sample");
    await tagger.addNewTag("sample", "test");
    await grid.assert.delay(1000);

    const container = await page.getByTestId("categorical-filter-tags");
    expect(container).toBeVisible();
    const div = page.getByTitle("test");
    expect(div).toBeVisible();
    expect(div).toHaveText("test5");
  });

  test("In grid, I can add a new label tag to all new samples", async ({
    page,
    tagger,
    sidebar,
    grid,
  }) => {
    await sidebar.clickFieldCheckbox("_label_tags");
    await sidebar.clickFieldDropdown("_label_tags");

    await tagger.clickTagger();
    await tagger.setActiveTaggerMode("label");
    await tagger.addNewTag("label", "all");

    await grid.assert.delay(1000);

    // Verify in the sidebar
    const container = await page.getByTestId("categorical-filter-_label_tags");
    expect(container).toBeVisible();
    const div = page.getByTitle("all");
    expect(div).toBeVisible();
    expect(div).toHaveText("all143");
  });
});
