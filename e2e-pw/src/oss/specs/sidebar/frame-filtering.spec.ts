import { test as base } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { SidebarPom } from "src/oss/poms/sidebar";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix("frame-filtering");

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

      dataset = foz.load_zoo_dataset("quickstart-video", dataset_name="${datasetName}", max_samples=1)
      dataset.persistent = True
      dataset.app_config.disable_frame_filtering = None
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
    await fiftyoneLoader.executePythonCode(
      `
        import fiftyone as fo

        dataset = fo.load_dataset("${datasetName}")
        dataset.app_config.disable_frame_filtering = None
        dataset.save()  
        `
    );
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
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
    await fiftyoneLoader.executePythonCode(
      `
        import fiftyone as fo

        dataset = fo.load_dataset("${datasetName}")
        dataset.app_config.disable_frame_filtering = True
        dataset.save()  
        `
    );
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
    await grid.actionsRow.toggleDisplayOptions();
    await sidebar.asserter.assertFieldDisabled("frames.detections");
    await sidebar.asserter.assertFieldEnabled("metadata.size_bytes");
    await sidebar.asserter.assertCheckboxesEnabled([
      "frames.detections",
      "metadata.size_bytes",
    ]);
  });
});
