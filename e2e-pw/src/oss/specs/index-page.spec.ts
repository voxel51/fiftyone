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

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test.beforeAll(async ({ fiftyoneLoader, foWebServer }) => {
  await foWebServer.startWebServer();
  await fiftyoneLoader.executePythonCode(`
  import fiftyone as fo

  dataset = fo.Dataset("${datasetName}")

  dataset.persistent = True`);
});

test.describe.serial("index page", () => {
  test("index page", async ({ pagePom, page }) => {
    await page.addInitScript(() => {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore injecting IS_PLAYWRIGHT into window so that
      // we can disable 1) analytics, and 2) QA performance toast banners
      window.IS_PLAYWRIGHT = true;
    });

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
});
