import { test as base, expect } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";
import { SidebarPom } from "../poms/sidebar";

const test = base.extend<{
  grid: GridPom;
  modal: ModalPom;
  sidebar: SidebarPom;
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
});

const datasetName = getUniqueDatasetNameWithPrefix("grid-tagging");

test.beforeAll(async ({ fiftyoneLoader }) => {
  await fiftyoneLoader.executePythonCode(`
    import fiftyone as fo

    filepaths = []
    for i in range(1, 511):
        filepath = f"/tmp/{i}.png"
        filepaths.append((i, filepath))
    
    dataset = fo.Dataset("${datasetName}")
    dataset.persistent = True
    dataset.add_samples(
        fo.Sample(filepath=filepath, index=i) for (i, filepath) in filepaths
    )
  `);
});

test("grid tagging", async ({ fiftyoneLoader, grid, page, sidebar }) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
  await sidebar.clickFieldCheckbox("filepath");
  await sidebar.clickFieldCheckbox("tags");
  await grid.scrollBottom();
  for (let i = 31; i <= 54; i++) {
    const locator = grid.locator.getByText(`/tmp/${i}.png`);
    await expect(locator).toBeVisible();
  }

  await grid.run(async () => {
    await grid.actionsRow.toggleTagSamplesOrLabels();
    await grid.tagger.setActiveTaggerMode("sample");
    await grid.tagger.addNewTag("sample", "grid-test");
  });

  for (let i = 31; i <= 54; i++) {
    const locator = grid.locator.getByText(`/tmp/${i}.png`);
    await expect(locator).toBeVisible();
    await expect(
      locator.locator("..").getByTestId("tag-tags-grid-test")
    ).toBeVisible();
  }
});
