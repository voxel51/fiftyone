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

test.beforeAll(async ({ datasetFactory, foWebServer }) => {
  await foWebServer.startWebServer();
  await datasetFactory.createDataset({ datasetName });
});

test.describe.serial("index page", () => {
  test("index page", async ({ pagePom, page }) => {
    await page.addInitScript(() => {
      // a user who has dismissed the one-time Enterprise intro and the
      // query performance toast
      window.localStorage.setItem("fiftyone-enterprise-tooltip-seen", "true");
      window.sessionStorage.setItem("hideQueryPerformanceToast", "true");
    });

    await pagePom.loadDataset();
    await pagePom.assert.verifyPage("index");
    await pagePom.assert.verifyPathname("/");

    await pagePom.loadDataset(datasetName);
    await pagePom.assert.verifyPage("dataset");
    await pagePom.assert.verifyPathname(`/datasets/${datasetName}`);

    await pagePom.goBack();
    await pagePom.assert.verifyPage("index");
    await pagePom.assert.verifyPathname("/");
  });
});
