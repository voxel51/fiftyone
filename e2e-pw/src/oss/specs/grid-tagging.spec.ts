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

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test.beforeAll(async ({ fiftyoneLoader, foWebServer }) => {
  await foWebServer.startWebServer();

  await fiftyoneLoader.executePythonCode(`
    import fiftyone as fo

    filepaths = []
    for i in range(1, 511):
        filepath = f"/tmp/{i}-${datasetName}.png"
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
  const indexes = Array.from({ length: 24 }, (_, i) => i + 31);
  const filepaths = indexes.map((i) => `/tmp/${i}-${datasetName}.png`);
  const bubble = (filepath: string) => grid.locator.getByText(filepath);

  await grid.afterTagsRendered(filepaths, async () => {
    await sidebar.clickFieldCheckbox("filepath");
    await sidebar.clickFieldCheckbox("tags");
    await grid.scrollBottom();
  });
  for (const filepath of filepaths) {
    expect(await bubble(filepath).isVisible()).toBe(true);
  }

  await grid.afterTagsRendered(filepaths, () =>
    grid.run(async () => {
      await grid.actionsRow.toggleTagSamplesOrLabels();
      await grid.tagger.setActiveTaggerMode("sample");
      await grid.tagger.addNewTag("sample", "grid-test");
    }),
  );

  for (const filepath of filepaths) {
    expect(await bubble(filepath).isVisible()).toBe(true);
    expect(
      await bubble(filepath)
        .locator("..")
        .getByTestId("tag-tags-grid-test")
        .isVisible(),
    ).toBe(true);
  }
});
