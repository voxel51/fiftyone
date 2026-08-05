import { test as base } from "src/oss/fixtures";
import { EmbeddingsV2Pom } from "src/oss/poms/panels/embeddings-v2-panel";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix("embeddings-panel");

const test = base.extend<{ embeddings: EmbeddingsV2Pom }>({
  embeddings: async ({ page }, use) => {
    await use(new EmbeddingsV2Pom(page));
  },
});

test.beforeAll(async ({ datasetFactory, foWebServer }) => {
  await foWebServer.startWebServer();
  await datasetFactory.createDataset({ datasetName });
});

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test("embeddings panel loads", async ({ embeddings, fiftyoneLoader, page }) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
  await embeddings.open();
  await embeddings.assert.verifyPanelLoaded();
});
