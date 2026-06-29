/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Asserts that the global "Pixelating..." loading screen does not re-trigger
 * when opening the modal or navigating between samples and slices in a group
 * dataset (left/right image slices + a 3D fo3d slice).
 */
import { test as base } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { PagePom } from "src/oss/poms/page";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix(
  "one-loading-screen-group-modal",
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
  await datasetFactory.createGroupDataset({
    datasetName,
    numGroups: 3,
  });
});

/**
 * Asserts that the loading screen appears exactly once (on initial page load)
 * and is not re-triggered by opening the modal, navigating between group
 * samples, or switching between image and 3D slices.
 */
test("does not show when opening or navigating the modal for a group dataset", async ({
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
  await modal.waitForSampleLoadDomAttribute();
  await pagePom.assert.hasHadOnlyOneGlobalLoadingScreen();

  await modal.navigateNextSample();
  await modal.waitForSampleLoadDomAttribute();
  await pagePom.assert.hasHadOnlyOneGlobalLoadingScreen();

  await modal.clickOnLooker3d();
  await modal.looker3dControls.waitForAllAssetsLoaded();
  await pagePom.assert.hasHadOnlyOneGlobalLoadingScreen();

  await modal.navigatePreviousSample();
  await modal.waitForSampleLoadDomAttribute(true);
  await pagePom.assert.hasHadOnlyOneGlobalLoadingScreen();
});
