import { test as base } from "src/oss/fixtures";
import { PagePom } from "src/oss/poms/page";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix(`index-page`);

const test = base.extend<{
  pagePom: PagePom;
}>({
  pagePom: async ({ eventUtils, page }, use) => {
    await use(new PagePom(page, eventUtils));
  },
});

test.beforeAll(async ({ fiftyoneLoader }) => {
  await fiftyoneLoader.executePythonCode(`
  import fiftyone as fo

  dataset = fo.Dataset("${datasetName}")

  dataset.persistent = True`);
});

test("index page", async ({ pagePom, page }) => {
  await pagePom.loadDataset();
  await pagePom.assert.verifyPage("index");
  await pagePom.assert.verifyPathname("/");

  await pagePom.loadDataset(datasetName);
  await pagePom.assert.verifyPage("dataset");
  await pagePom.assert.verifyPathname(`/datasets/${datasetName}`);

  await page.goBack();
  await pagePom.assert.verifyPage("index");
  await pagePom.assert.verifyPathname("/");
});
