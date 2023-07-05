import { expect, test } from "src/oss/fixtures";
import { Duration, getUniqueDatasetNameWithPrefix } from "src/oss/utils";

test("smoke", async ({ page, fiftyoneLoader }) => {
  const datasetName = getUniqueDatasetNameWithPrefix("smoke-quickstart");

  await fiftyoneLoader.loadZooDataset("quickstart", datasetName, {
    max_samples: 5,
  });

  await fiftyoneLoader.waitUntilLoad(page, datasetName);

  await expect(page.getByTestId("entry-counts")).toHaveText("5 samples");
});
