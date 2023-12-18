import { test as base } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { SidebarPom } from "src/oss/poms/sidebar";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix("lightning");

const test = base.extend<{ sidebar: SidebarPom; grid: GridPom }>({
  sidebar: async ({ page }, use) => {
    await use(new SidebarPom(page));
  },
  grid: async ({ page, eventUtils }, use) => {
    await use(new GridPom(page, eventUtils));
  },
});

test.describe("lightning", () => {
  test.beforeAll(async ({ fiftyoneLoader }) => {
    await fiftyoneLoader.executePythonCode(
      `
        import fiftyone as fo

        dataset = fo.Dataset("${datasetName}")
        dataset.persistent = True
        dataset.add_sample_field(
            "ground_truth", fo.EmbeddedDocumentField, embedded_doc_type=fo.Detections
        )
        dataset.add_samples(
            [fo.Sample(filepath="one.png"), fo.Sample(filepath="two.png")]
        )
        dataset.create_index("$**")
        `
    );
  });

  test.beforeEach(async ({ page, fiftyoneLoader }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
  });

  test("assert enabled fields", async ({ grid, sidebar }) => {
    await grid.actionsRow.toggleDisplayOptions();
    await grid.actionsRow.displayActions.setLightningMode("enable");

    await sidebar.asserter.assertFieldsEnabled([
      "tags",
      "metadata.mime_type",
      "ground_truth",
      "id",
      "filepath",
    ]);
    await sidebar.asserter.assertFieldsDisabled([
      "_label_tags",
      "metadata.size_bytes",
      "metadata.width",
      "metadata.height",
      "metadata.num_channels",
    ]);
  });

  test("assert id field validation error", async ({ grid, sidebar }) => {
    await sidebar.clickFieldDropdown("id");
  });
});
