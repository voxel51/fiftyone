import { test as base } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { SidebarPom } from "src/oss/poms/sidebar";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetNameFilteringEnabled = getUniqueDatasetNameWithPrefix(
  "frame-filtering-enabled"
);
const datasetNameFilteringDisabled = getUniqueDatasetNameWithPrefix(
  "frame-filtering-disabled"
);

const test = base.extend<{ sidebar: SidebarPom; grid: GridPom }>({
  sidebar: async ({ page }, use) => {
    await use(new SidebarPom(page));
  },
  grid: async ({ page, eventUtils }, use) => {
    await use(new GridPom(page, eventUtils));
  },
});

test.describe("frame filtering", () => {
  test.beforeAll(async ({ fiftyoneLoader }) => {
    await fiftyoneLoader.executePythonCode(
      `
      import fiftyone.zoo as foz

      datasets = [
        ("${datasetNameFilteringEnabled}", False),
        ("${datasetNameFilteringDisabled}", True),
      ]
      
      for name, disable in datasets:
        dataset = foz.load_zoo_dataset("quickstart-video", dataset_name=name, max_samples=1)
        dataset.app_config.disable_frame_filtering = disable
        dataset.persistent = True
        dataset.save()
      `
    );
  });

  test("assert enabled frame filtering", async ({
    sidebar,
    grid,
    page,
    fiftyoneLoader,
  }) => {
    await fiftyoneLoader.waitUntilGridVisible(
      page,
      datasetNameFilteringEnabled
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
      datasetNameFilteringDisabled
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
