import { test as base } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { PanelPom } from "src/oss/poms/panels/panel";
import { EmbeddingsPom } from "src/oss/poms/panels/embeddings-panel";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix("smoke-quickstart");

const test = base.extend<{ grid: GridPom; panel: PanelPom }>({
  grid: async ({ page, eventUtils }, use) => {
    await use(new GridPom(page, eventUtils));
  },
  panel: async ({ page }, use) => {
    await use(new PanelPom(page));
  },
  embeddings: async ({ page, eventUtils }, use) => {
    await use(new EmbeddingsPom(page, eventUtils));
  },
});

test.beforeAll(async ({ fiftyoneLoader }) => {
  await fiftyoneLoader.executePythonCode(
    `
        import fiftyone as fo
        import fiftyone.zoo as foz
        import fiftyone.brain as fob
        import numpy as np

        dataset = foz.load_zoo_dataset("quickstart", max_samples=5, dataset_name="${datasetName}")
        dataset.persistent = True

        embeddings = np.random.random((5, 512))
        fob.compute_visualization(dataset, brain_key="img_viz", embeddings=embeddings)

        dataset.save()
    `
  );
});

test.beforeEach(async ({ page, fiftyoneLoader }) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
});

test.describe("quickstart", () => {
  test("embeddings panel opens", async ({ panel, embeddings }) => {
    await panel.open("Embeddings");
    await embeddings.asserter.verifySelectorVisible();
  });

  test("lasso samples work", async ({ panel, embeddings }) => {
    await panel.open("Embeddings");
    await embeddings.asserter.verifyLassoSelectsSamples();
  });
});
