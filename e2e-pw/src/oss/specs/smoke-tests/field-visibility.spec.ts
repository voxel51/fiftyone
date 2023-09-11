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
    await fiftyoneLoader.loadZooDataset("quickstart", datasetName, {
      max_samples: 5,
    });
  });

  test.beforeEach(async ({ page, fiftyoneLoader }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
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
