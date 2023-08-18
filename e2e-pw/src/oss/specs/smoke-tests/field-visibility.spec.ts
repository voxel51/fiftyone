import { test as base, expect } from "src/oss/fixtures";
import { FieldVisibilityPom } from "src/oss/poms/field-visibility/field-visibility";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix("smoke-quickstart");

const test = base.extend<{ fieldVisibility: FieldVisibilityPom }>({
  fieldVisibility: async ({ page }, use) => {
    await use(new FieldVisibilityPom(page));
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

  test("field visibility modal opens", async ({ fieldVisibility }) => {
    await fieldVisibility.openFieldVisibilityModal();
  });

  test("sidebar group is hidden if all its fields are hidden using field visibility", async ({
    fieldVisibility,
  }) => {
    await fieldVisibility.assert.assertSidebarGroupIsVisibile("labels");
    await fieldVisibility.assert.assertFieldsInSidebar([
      "predictions",
      "ground_truth",
    ]);

    await fieldVisibility.hideFields(["predictions", "ground_truth"]);
    await fieldVisibility.assert.assertFieldsNotInSidebar([
      "predictions",
      "ground_truth",
    ]);

    await fieldVisibility.assert.assertSidebarGroupIsHidden("labels");

    await fieldVisibility.clearFieldVisibilityChanges();
    await fieldVisibility.assert.assertSidebarGroupIsVisibile("labels");
    await fieldVisibility.assert.assertFieldsInSidebar([
      "predictions",
      "ground_truth",
    ]);
  });
});
