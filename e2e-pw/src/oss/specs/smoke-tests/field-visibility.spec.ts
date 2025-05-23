import { test as base } from "src/oss/fixtures";
import { FieldVisibilityPom } from "src/oss/poms/field-visibility/field-visibility";
import { GridPom } from "src/oss/poms/grid";
import { SidebarPom } from "src/oss/poms/sidebar";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix("smoke-quickstart");

const test = base.extend<{
  fieldVisibility: FieldVisibilityPom;
  sidebar: SidebarPom;
}>({
  fieldVisibility: async ({ page, eventUtils }, use) => {
    const gridPom = new GridPom(page, eventUtils);
    await use(new FieldVisibilityPom(page, gridPom));
  },
  sidebar: async ({ page }, use) => {
    await use(new SidebarPom(page));
  },
});

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test.beforeAll(async ({ fiftyoneLoader, foWebServer }) => {
  await foWebServer.startWebServer();

  await fiftyoneLoader.executePythonCode(`
    import fiftyone as fo
    import fiftyone.zoo as foz

    # just for the schema
    dataset = foz.load_zoo_dataset("quickstart", dataset_name="${datasetName}", max_samples=0)
    dataset.persistent = True
    dataset.save()
    dataset.add_sample(fo.Sample(filepath="dummy.png"))

    field = dataset.get_field("ground_truth")
    field.description = "ground_truth description"
    field.info = {"owner": "bob"}
    field.save()

    field = dataset.get_field("metadata.width")
    field.description = "metadata.width description"
    field.info = {"owner": "bob"}
    field.save()

    dataset.save()
  `);
});

test.describe.serial("field visibility", () => {
  test.beforeEach(async ({ page, fiftyoneLoader }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
  });

  test("correct tooltip when hovering over feature icon", async ({
    fieldVisibility,
  }) => {
    await fieldVisibility.asserter.fieldVisibilityIconHasTooltip();
  });

  test("deselect all fields works - deselects enabled fields", async ({
    fieldVisibility,
  }) => {
    await fieldVisibility.openFieldVisibilityModal();
    await fieldVisibility.toggleAllSelection();
    await fieldVisibility.asserter.assertEnabledFieldsAreUnselected();
  });

  test("show nested field works", async ({ fieldVisibility }) => {
    await fieldVisibility.openFieldVisibilityModal();
    await fieldVisibility.toggleShowNestedFields();
    await fieldVisibility.asserter.assertNestedFieldsVisible();
  });

  test("show metadata works", async ({ fieldVisibility }) => {
    await fieldVisibility.openFieldVisibilityModal();
    await fieldVisibility.asserter.assertMetadataInvisibile();
    await fieldVisibility.toggleShowMetadata();
    await fieldVisibility.asserter.assertMetadataVisibile();
  });

  test("show metadata works for nested fields", async ({ fieldVisibility }) => {
    await fieldVisibility.openFieldVisibilityModal();
    await fieldVisibility.asserter.assertMetadataInvisibile("metadata.width");
    await fieldVisibility.toggleShowNestedFields();
    await fieldVisibility.toggleShowMetadata();
    await fieldVisibility.asserter.assertMetadataVisibile("metadata.width");
  });

  test("reset works", async ({ fieldVisibility, sidebar }) => {
    await fieldVisibility.hideFields(["predictions", "ground_truth"]);
    await sidebar.asserter.assertFieldsNotInSidebar([
      "predictions",
      "ground_truth",
    ]);

    // reopen modal
    await fieldVisibility.openFieldVisibilityModal();
    await fieldVisibility.clickReset();
    await sidebar.asserter.assertFieldsInSidebar([
      "predictions",
      "ground_truth",
    ]);
  });

  test("filter rule tab has Examples when no filter rule", async ({
    fieldVisibility,
  }) => {
    await fieldVisibility.openFieldVisibilityModal();
    await fieldVisibility.openTab("Filter rule");
    await fieldVisibility.asserter.assertFilterRuleExamplesVisibile();
  });

  test("non-matching filter rule shows default paths as results", async ({
    fieldVisibility,
  }) => {
    await fieldVisibility.openFieldVisibilityModal();
    await fieldVisibility.openTab("Filter rule");
    await fieldVisibility.addFilterRuleInput("metadata");
    await fieldVisibility.asserter.assertDefaultPathsSelected();
  });

  test("filter rule by info shows results", async ({ fieldVisibility }) => {
    await fieldVisibility.openFieldVisibilityModal();
    await fieldVisibility.openTab("Filter rule");
    await fieldVisibility.addFilterRuleInput("owner:bob");
    await fieldVisibility.asserter.assertFieldsAreSelected(["ground_truth"]);
  });

  test("filter rule by description shows results", async ({
    fieldVisibility,
  }) => {
    await fieldVisibility.openFieldVisibilityModal();
    await fieldVisibility.openTab("Filter rule");
    await fieldVisibility.addFilterRuleInput(
      "description:ground_truth description"
    );
    await fieldVisibility.asserter.assertFieldsAreSelected(["ground_truth"]);
  });

  test("filter rule by name shows results", async ({ fieldVisibility }) => {
    await fieldVisibility.openFieldVisibilityModal();
    await fieldVisibility.openTab("Filter rule");
    await fieldVisibility.addFilterRuleInput("name:predictions");
    await fieldVisibility.asserter.assertFieldsAreSelected(["predictions"]);
  });

  test("filter rule by free text shows results if text in field info", async ({
    fieldVisibility,
  }) => {
    await fieldVisibility.openFieldVisibilityModal();
    await fieldVisibility.openTab("Filter rule");
    await fieldVisibility.addFilterRuleInput("bob");
    await fieldVisibility.asserter.assertFieldsAreSelected(["ground_truth"]);
  });

  test("sidebar group is hidden if all its fields are hidden using field visibility", async ({
    fieldVisibility,
    sidebar,
  }) => {
    await sidebar.asserter.assertSidebarGroupIsVisibile("labels");
    await sidebar.asserter.assertFieldsInSidebar([
      "predictions",
      "ground_truth",
    ]);

    await fieldVisibility.hideFields(["predictions", "ground_truth"]);
    await sidebar.asserter.assertFieldsNotInSidebar([
      "predictions",
      "ground_truth",
    ]);

    await sidebar.asserter.assertSidebarGroupIsHidden("labels");

    await fieldVisibility.clearFieldVisibilityChanges();
    await sidebar.asserter.assertSidebarGroupIsVisibile("labels");
    await sidebar.asserter.assertFieldsInSidebar([
      "predictions",
      "ground_truth",
    ]);
  });

  test("sidebar add group input is hidden when field visibility is active", async ({
    sidebar,
    fieldVisibility,
  }) => {
    await sidebar.asserter.assertAddGroupVisible();
    await fieldVisibility.hideFields(["ground_truth"]);
    await sidebar.asserter.assertAddGroupHidden();
  });
});
