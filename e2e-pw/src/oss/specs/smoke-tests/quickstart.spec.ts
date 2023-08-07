import { expect, test } from "src/oss/fixtures";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix("smoke-quickstart");

test.beforeAll(async ({ fiftyoneLoader }) => {
  await fiftyoneLoader.loadZooDataset("quickstart", datasetName, {
    max_samples: 5,
  });
});

test.beforeEach(async ({ page, fiftyoneLoader }) => {
  await fiftyoneLoader.waitUntilLoad(page, datasetName);
});

test("smoke", async ({ page }) => {
  await expect(page.getByTestId("entry-counts")).toHaveText("5 samples");
});
