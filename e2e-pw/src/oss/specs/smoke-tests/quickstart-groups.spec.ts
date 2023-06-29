import { test } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix("quickstart-groups");

test.describe("quickstart-groups dataset", () => {
  test.beforeAll(async ({ fiftyoneLoader }) => {
    await fiftyoneLoader.loadZooDataset("quickstart-groups", datasetName, {
      max_samples: 12,
    });
  });

  test.beforeEach(async ({ page, fiftyoneLoader }) => {
    await fiftyoneLoader.waitUntilLoad(page, datasetName);
  });

  test("should have four lookers", async ({ page }) => {
    const grid = new GridPom(page);
    grid.assertHasNLookers(4);
  });
});
