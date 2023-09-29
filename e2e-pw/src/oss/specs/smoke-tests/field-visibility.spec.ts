import { test as base } from "src/oss/fixtures";
import { FieldVisibilityPom } from "src/oss/poms/field-visibility/field-visibility";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";
import { SidebarPom } from "src/oss/poms/sidebar";

const datasetName = getUniqueDatasetNameWithPrefix("smoke-quickstart");

const test = base.extend<{
  fieldVisibility: FieldVisibilityPom;
  sidebar: SidebarPom;
}>({
  fieldVisibility: async ({ page }, use) => {
    await use(new FieldVisibilityPom(page));
  },
  sidebar: async ({ page }, use) => {
    await use(new SidebarPom(page));
  },
});

test.describe("field visibility", () => {
  test.beforeAll(async ({ fiftyoneLoader }) => {
    await fiftyoneLoader.executePythonCode(`
      import fiftyone as fo
      import fiftyone.zoo as foz

      dataset = foz.load_zoo_dataset("quickstart", dataset_name="${datasetName}")
      dataset.persistent = True
      dataset.save()

      field = dataset.get_field("ground_truth")
      field.description = "ground_truth description"
      field.info = {"owner": "bob"}
      field.save()

      field = dataset.get_field("metadata.width")
      field.description = "metadata.width description"
      field.info = {"owner": "bob"}
      field.save()

      dataset.add_samples([fo.Sample(filepath=f"{i}.png", group=1, i=i) for i in range(0, 21)])
      dataset.save()
    `);
  });

  test.beforeEach(async ({ page, fiftyoneLoader }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
  });

  test("modal opens", async ({ fieldVisibility }) => {
    await fieldVisibility.openFieldVisibilityModal();
  });

  test("correct tooltip when hovering over feature icon", async ({
    fieldVisibility,
  }) => {
    await fieldVisibility.asserter.fieldVisibilityIconHasTooltip();
  });

  test("all fields are selected initially", async ({ fieldVisibility }) => {
    await fieldVisibility.asserter.assertAllFieldsSelected();
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

  test("sidebar entries are not draggable when field visibility is active", async ({
    fieldVisibility,
    sidebar,
  }) => {
    // drag predictions to metadata group succeeds
    await sidebar.asserter.assertCanDragFieldToGroup("predictions", "metadata");

    await fieldVisibility.hideFields(["ground_truth"]);
    await sidebar.asserter.assertFieldsNotInSidebar(["ground_truth"]);

    // drag predictions back to labels group fails
    await sidebar.asserter.assertCannotDragField("predictions");

    await fieldVisibility.clearFieldVisibilityChanges();
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
