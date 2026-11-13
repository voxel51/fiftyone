import { test as base } from "src/oss/fixtures";
import { OperatorsBrowserPom } from "src/oss/poms/operators/operators-browser";
import { UrlPom } from "src/oss/poms/url";
import { ViewBarPom } from "src/oss/poms/viewbar/viewbar";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix("built-in-operators");
const test = base.extend<{
  operatorsBrowser: OperatorsBrowserPom;
  url: UrlPom;
  viewBar: ViewBarPom;
}>({
  operatorsBrowser: async ({ page, eventUtils }, use) => {
    await use(new OperatorsBrowserPom(page, eventUtils));
  },
  url: async ({ page, eventUtils }, use) => {
    await use(new UrlPom(page, eventUtils));
  },
  viewBar: async ({ page, eventUtils }, use) => {
    await use(new ViewBarPom(page, eventUtils));
  },
});

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test.beforeAll(async ({ datasetFactory, foWebServer }) => {
  await foWebServer.startWebServer();
  await datasetFactory.createDataset({ datasetName });
});

test.beforeEach(async ({ page, fiftyoneLoader }) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
});

test("Built-in operators: set view", async ({
  operatorsBrowser,
  url,
  viewBar,
}) => {
  await operatorsBrowser.show();
  await operatorsBrowser.search("E2E");
  // A view set by an operator opens the stages row on its own
  await viewBar.afterStagesShown(() =>
    url.pageChange(() => operatorsBrowser.choose("E2E: Set view")),
  );
  await viewBar.assert.viewStages(["Limit3"]);
});
