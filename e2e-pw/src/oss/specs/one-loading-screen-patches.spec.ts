/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Asserts that the global "Pixelating..." loading screen does not re-trigger
 * when opening the modal or navigating between samples in a patches view.
 *
 * Regression guard: the modal similarity action read the async modal sample
 * through `availableSimilarityKeys` at mount in patches views, suspending up
 * to the top-level Suspense boundary.
 */
import { test as base } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { PagePom } from "src/oss/poms/page";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix(
  "one-loading-screen-patches",
);

const test = base.extend<{
  grid: GridPom;
  modal: ModalPom;
  pagePom: PagePom;
}>({
  grid: async ({ page, eventUtils }, use) => {
    await use(new GridPom(page, eventUtils));
  },
  modal: async ({ page, eventUtils }, use) => {
    await use(new ModalPom(page, eventUtils));
  },
  pagePom: async ({ page, eventUtils }, use) => {
    await use(new PagePom(page, eventUtils));
  },
});

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test.beforeAll(async ({ datasetFactory, foWebServer }) => {
  await foWebServer.startWebServer();
  await datasetFactory.createDataset({
    datasetName,
    numSamples: 3,
    schema: {
      predictions: "Detections",
    },
    withSampleData: (_, { createId }) => ({
      predictions: {
        detections: [
          {
            _id: createId(),
            label: "cat",
            bounding_box: [0.1, 0.1, 0.2, 0.2],
          },
          {
            _id: createId(),
            label: "dog",
            bounding_box: [0.3, 0.3, 0.2, 0.2],
          },
        ],
      },
    }),
    savedViews: { patches: "dataset.to_patches('predictions')" },
  });
});

/**
 * Asserts that the loading screen appears exactly once (on initial page load)
 * and is not re-triggered by opening the modal or navigating to the next
 * patch in a patches view.
 */
test("does not show when opening or navigating the modal in a patches view", async ({
  fiftyoneLoader,
  grid,
  modal,
  page,
  pagePom,
}) => {
  const loadingScreens = await pagePom.armGlobalLoadingScreenCounter();
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
    searchParams: new URLSearchParams({ view: "patches" }),
  });
  await pagePom.assert.hasHadOnlyOneGlobalLoadingScreen(loadingScreens);

  await grid.openFirstSample();
  await modal.waitForSampleLoadDomAttribute();
  await pagePom.assert.hasHadOnlyOneGlobalLoadingScreen(loadingScreens);

  await modal.navigateNextSample();
  await modal.waitForSampleLoadDomAttribute();
  await pagePom.assert.hasHadOnlyOneGlobalLoadingScreen(loadingScreens);
});
