import { test, expect } from "src/fixtures";

test("smoke", async ({ page, fiftyoneLoader }) => {
  await fiftyoneLoader.loadZooDataset("quickstart", {
    dataset_name: "quickstart",
  });

  await fiftyoneLoader.waitUntilLoad(page, "quickstart");
});
