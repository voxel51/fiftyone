import { test as base } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { EmbeddingsPom } from "src/oss/poms/panels/embeddings-panel";
import { GridPanelPom } from "src/oss/poms/panels/grid-panel";
import { Duration, getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix("smoke-quickstart");

const test = base.extend<{
  embeddings: EmbeddingsPom;
  grid: GridPom;
  panel: GridPanelPom;
}>({
  grid: async ({ eventUtils, page }, use) => {
    await use(new GridPom(page, eventUtils));
  },
  panel: async ({ page }, use) => {
    await use(new GridPanelPom(page));
  },
  embeddings: async ({ eventUtils, page }, use) => {
    await use(new EmbeddingsPom(page, eventUtils));
  },
});

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test.beforeAll(async ({ fiftyoneLoader, foWebServer }, testInfo) => {
  // embeddings generation may take a while on slow computers
  testInfo.setTimeout(Duration.Minutes(2));

  await foWebServer.startWebServer();
  await fiftyoneLoader.executePythonCode(
    `

      # TF_INTRA/INTER_OP=1 forces single-threaded init, which sidesteps the
      # Abseil mutex deadlock seen.
      import os
      os.environ["TF_INTRA_OP_PARALLELISM_THREADS"] = "1"
      os.environ["TF_INTER_OP_PARALLELISM_THREADS"] = "1"

      import sys, types

      # Block umap.parametric_umap from triggering \`import tensorflow\` during
      # umap/__init__.py load (causes an Abseil mutex deadlock on macOS during
      # TF's C++ static init). compute_visualization only uses umap.UMAP, never
      # ParametricUMAP, so a stub is fine.
      if "umap.parametric_umap" not in sys.modules:
          _stub = types.ModuleType("umap.parametric_umap")

          class _ParametricUMAPDisabled:
              def __init__(self, *a, **kw):
                  raise NotImplementedError(
                      "ParametricUMAP disabled to avoid TensorFlow deadlock"
                  )

          _stub.ParametricUMAP = _ParametricUMAPDisabled
          sys.modules["umap.parametric_umap"] = _stub

      import fiftyone.core.utils as fou
      umap = fou.lazy_import("umap.umap_")
      import fiftyone as fo
      import fiftyone.zoo as foz
      import fiftyone.brain as fob
      import numpy as np
      np.random.seed(42)

      dataset = foz.load_zoo_dataset("quickstart", max_samples=5, dataset_name="${datasetName}")
      dataset.persistent = True

      embeddings = np.random.random((5, 512))
      # umap is default
      fob.compute_visualization(dataset, brain_key="img_viz", embeddings=embeddings)

      dataset.save()
    `
  );
});

test.beforeEach(async ({ fiftyoneLoader, page }, testInfo) => {
  testInfo.setTimeout(Duration.Minutes(2));

  await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
});

test.describe.serial("embeddings on quickstart dataset", () => {
  test("embeddings panel opens", async ({
    embeddings,
    panel,
  }: {
    embeddings: EmbeddingsPom;
    panel: GridPanelPom;
  }) => {
    await panel.open("Embeddings");
    await embeddings.asserter.verifySelectorVisible();
    await embeddings.asserter.verifyLassoSelectsSamples();
    await panel.close();
  });
});
