import { expect, test } from "src/oss/fixtures";
import { Duration } from "src/oss/utils";

test("smoke", async ({ page, fiftyoneLoader }) => {
  await fiftyoneLoader.loadZooDataset("quickstart", "smoke-quickstart", {
    max_samples: 5,
  });

  await fiftyoneLoader.waitUntilLoad(page, "smoke-quickstart");

  await expect(page.getByTestId("entry-count-all")).toHaveText("5");
});
