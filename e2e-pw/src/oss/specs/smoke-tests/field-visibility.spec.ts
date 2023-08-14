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

  test.beforeEach(async ({ page, fiftyoneLoader, fieldVisibility }) => {
    await fiftyoneLoader.waitUntilLoad(page, datasetName);
  });

  test("Field visibility modal opens", async ({ fieldVisibility }) => {
    await fieldVisibility.openFieldVisibilityModal();
  });

  test("predictions field should no longer be in the sidebar if it was hidden using field visibility", async ({
    fieldVisibility,
  }) => {
    await fieldVisibility.assert.assertFieldInSidebar("predictions");
    await fieldVisibility.hideFields(["predictions"]);
    // await fieldVisibility.assert.assertFieldNotInSidebar("predictions");
  });
});
