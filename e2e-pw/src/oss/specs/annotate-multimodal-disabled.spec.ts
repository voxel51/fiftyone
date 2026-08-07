import { test as base, expect } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix(
  "smoke-annotate-multimodal-disabled",
);

const test = base.extend<{
  grid: GridPom;
  modal: ModalPom;
}>({
  grid: async ({ page, eventUtils }, use) => {
    await use(new GridPom(page, eventUtils));
  },
  modal: async ({ page, eventUtils }, use) => {
    await use(new ModalPom(page, eventUtils));
  },
});

test.beforeAll(async ({ fiftyoneLoader, foWebServer }) => {
  await foWebServer.startWebServer();
  // ``.mcap`` gives the sample the ``multimodal`` media type, which makes the
  // whole dataset multimodal (media type can't change after creation).
  await fiftyoneLoader.executePythonCode(`
    import fiftyone as fo

    dataset = fo.Dataset("${datasetName}")
    dataset.add_sample(fo.Sample(filepath="/tmp/${datasetName}.mcap"))
    dataset.persistent = True
  `);
});

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test.beforeEach(async ({ page, fiftyoneLoader }) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
});

test.describe.serial("annotate-multimodal-disabled", () => {
  test("the classic sidebar's explore/annotate mode switcher is unavailable for multimodal datasets", async ({
    grid,
    modal,
  }) => {
    await grid.openFirstSample();

    // Multimodal media renders through its own MM sidebar (Inspect/Fields
    // tabs) instead of the classic sidebar entirely, so there's no
    // explore/annotate mode switcher to switch into "annotate" mode with in
    // the first place — nothing left to disable.
    await expect(modal.sidebar.locator).toHaveCount(0);
  });
});
