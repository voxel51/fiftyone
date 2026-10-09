import { test as base } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { SidebarPom } from "src/oss/poms/sidebar";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetNameFilteringEnabled = getUniqueDatasetNameWithPrefix(
  "frame-filtering-enabled",
);
const datasetNameFilteringDisabled = getUniqueDatasetNameWithPrefix(
  "frame-filtering-disabled",
);

const test = base.extend<{ sidebar: SidebarPom; grid: GridPom }>({
  sidebar: async ({ page }, use) => {
    await use(new SidebarPom(page));
  },
  grid: async ({ page, eventUtils }, use) => {
    await use(new GridPom(page, eventUtils));
  },
});

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test.beforeAll(async ({ datasetFactory, fiftyoneLoader, foWebServer }) => {
  await foWebServer.startWebServer();

  // video datasets compute metadata, so metadata.size_bytes is populated
  for (const datasetName of [
    datasetNameFilteringEnabled,
    datasetNameFilteringDisabled,
  ]) {
    await datasetFactory.createDataset({
      mediaType: "video",
      datasetName,
      schema: { "frames.detections": "Detections" },
    });
  }

  await fiftyoneLoader.executePythonCode(`
    import fiftyone as fo

    dataset = fo.load_dataset("${datasetNameFilteringDisabled}")
    dataset.app_config.disable_frame_filtering = True
    dataset.save()
  `);
});

test.describe.serial("frame filtering", () => {
  test("assert enabled frame filtering", async ({
    sidebar,
    grid,
    page,
    fiftyoneLoader,
  }) => {
    await fiftyoneLoader.waitUntilGridVisible(
      page,
      datasetNameFilteringEnabled,
    );
    await grid.actionsRow.toggleDisplayOptions();
    await sidebar.asserter.assertFieldsEnabled([
      "frames.detections",
      "metadata.size_bytes",
    ]);
    await sidebar.asserter.assertCheckboxesEnabled([
      "frames.detections",
      "metadata.size_bytes",
    ]);
  });

  test("assert disabled frame filtering", async ({
    sidebar,
    fiftyoneLoader,
    grid,
    page,
  }) => {
    await fiftyoneLoader.waitUntilGridVisible(
      page,
      datasetNameFilteringDisabled,
    );
    await grid.actionsRow.toggleDisplayOptions();
    await sidebar.asserter.assertFieldDisabled("frames.detections");
    await sidebar.asserter.assertFieldEnabled("metadata.size_bytes");
    await sidebar.asserter.assertCheckboxesEnabled([
      "frames.detections",
      "metadata.size_bytes",
    ]);
  });
});
