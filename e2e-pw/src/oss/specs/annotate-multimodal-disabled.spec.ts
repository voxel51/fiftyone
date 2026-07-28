import { test as base } from "src/oss/fixtures";
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
  test("annotate sidebar is disabled for multimodal datasets", async ({
    grid,
    modal,
  }) => {
    await grid.openFirstSample();

    // multimodal media renders through its own viewer, not the looker, so
    // looker load markers never appear; switching modes auto-waits on the
    // sidebar tab, which is this test's real precondition
    await modal.sidebar.switchMode("annotate");

    // the annotate sidebar must refuse to load and explain why, rather than
    // exposing the annotation tools for an unsupported media type
    await modal.sidebar.assert.hasDisabledMessage(
      "supported for multimodal datasets",
    );
  });
});
