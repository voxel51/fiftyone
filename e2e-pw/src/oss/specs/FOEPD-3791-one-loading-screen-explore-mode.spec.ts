/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * The global loading screen is the top-level Suspense fallback rendered by
 * Renderer.tsx. It dispatches a GlobalLoadingScreenEvent on each mount.
 * It should fire exactly once, on initial page load.
 */
import { test as base } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { PagePom } from "src/oss/poms/page";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix(
  "one-loading-screen-explore-mode"
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
    numSamples: 2,
  });
});

/**
 * Asserts that the loading screen appears exactly once (on initial page load)
 * and is not re-triggered by opening the modal or navigating between samples.
 */
test("does not show when opening or navigating in the modal's explore mode for an image dataset", async ({
  fiftyoneLoader,
  grid,
  modal,
  page,
  pagePom,
}) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
  await pagePom.assert.hasHadOnlyOneGlobalLoadingScreen();
  await grid.openFirstSample();
  await modal.waitForSampleLoadDomAttribute();
  await pagePom.assert.hasHadOnlyOneGlobalLoadingScreen();

  await modal.navigateNextSample();
  await pagePom.assert.hasHadOnlyOneGlobalLoadingScreen();
});
