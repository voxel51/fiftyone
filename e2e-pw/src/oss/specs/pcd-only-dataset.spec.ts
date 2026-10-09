import { test as base } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix(
  "pcd-orthographic-projection",
);

const test = base.extend<{ grid: GridPom; modal: ModalPom }>({
  grid: async ({ page, eventUtils }, use) => {
    await use(new GridPom(page, eventUtils));
  },
  modal: async ({ page, eventUtils }, use) => {
    await use(new ModalPom(page, eventUtils));
  },
});

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test.beforeAll(async ({ datasetFactory, foWebServer }) => {
  await foWebServer.startWebServer();
  // a cube, and the same cube with a NaN coordinate in three points
  await datasetFactory.createDataset({
    mediaType: "point-cloud",
    datasetName,
    numSamples: 2,
    pcdOptions: (index) => ({
      shape: "cube",
      numPoints: 100,
      ...(index === 1
        ? {
            imputeNaN: {
              indices: [
                [0, 0],
                [1, 1],
                [2, 2],
              ],
            },
          }
        : {}),
    }),
    // TODO: fix the underlying NaN handling in fiftyone.utils.utils3d.
    orthographicProjections: { size: [-1, 64], skipFailures: true },
  });
});

test.describe.serial("orthographic projections", () => {
  test.beforeEach(async ({ page, fiftyoneLoader }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName, { tiles: 2 });
  });

  test("orthographic projections are rendered correctly", async ({
    grid,
    modal,
    page,
  }) => {
    await grid.assert.hasTileScreenshots(
      "orthographic-projection-grid-cuboids",
      2,
    );

    await page.evaluate(() =>
      localStorage.setItem("fo-3d-annotation-tips-dismissed", "true"),
    );
    // both point clouds render in the modal, the one with NaN points too
    await modal.afterLooker3dSettled(() => grid.openFirstSample());
    await modal.sampleCanvas3d.assert.hasScreenshot(
      "orthographic-projection-modal-cuboid-1.png",
    );

    await modal.afterLooker3dSettled(() => modal.navigateNextSample());
    await modal.sampleCanvas3d.assert.hasScreenshot(
      "orthographic-projection-modal-cuboid-2.png",
    );
  });
});
