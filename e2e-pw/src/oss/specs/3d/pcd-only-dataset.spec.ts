import { test as base, expect } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix(
  "pcd-orthographic-projection"
);
const normalPcd = `/tmp/test-pcd1-${datasetName}.pcd`;
const pcdWithNaN = `/tmp/test-pcd2-${datasetName}.pcd`;

/**
 * Hide these elements when taking screenshots
 */
const getScreenshotMasks = (modal: ModalPom) => [
  modal.locator.getByTestId("looker3d-action-bar"),
  modal.locator.getByTestId("selectable-bar"),
];

const test = base.extend<{ grid: GridPom; modal: ModalPom }>({
  grid: async ({ page, eventUtils }, use) => {
    await use(new GridPom(page, eventUtils));
  },
  modal: async ({ page, eventUtils }, use) => {
    await use(new ModalPom(page, eventUtils));
  },
});

test.describe("orthographic projections", () => {
  test.beforeAll(async ({ fiftyoneLoader, mediaFactory }) => {
    mediaFactory.createPcd({
      outputPath: normalPcd,
      shape: "cube",
      numPoints: 100,
    });
    mediaFactory.createPcd({
      outputPath: pcdWithNaN,
      shape: "cube",
      numPoints: 100,
      imputeNaN: {
        indices: [
          [0, 0],
          [1, 1],
          [2, 2],
        ],
      },
    });

    await fiftyoneLoader.executePythonCode(
      `
      import fiftyone as fo
      import fiftyone.utils.utils3d as fou3d

      dataset = fo.Dataset("${datasetName}")
      dataset.persistent = True

      sample1 = fo.Sample(filepath="${normalPcd}")
      sample2 = fo.Sample(filepath="${pcdWithNaN}")
      dataset.add_samples([sample1, sample2])

      fou3d.compute_orthographic_projection_images(dataset, (-1, 64), "/tmp/ortho") 
      `
    );
  });

  test.beforeEach(async ({ page, fiftyoneLoader }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
  });

  test("orthographic projections are rendered correctly", async ({
    modal,
    grid,
  }) => {
    const mask = getScreenshotMasks(modal);

    await expect(grid.getForwardSection()).toHaveScreenshot(
      "orthographic-projection-grid-cuboids.png",
      {
        mask,
        animations: "allow",
      }
    );

    // TODO: FIX ME. MODAL SCREENSHOT COMPARISON IS OFF BY ONE-PIXEL

    // // open modal and check that pcds are rendered correctly
    // await grid.openFirstSample();
    // await modal.modalContainer.hover();

    // await expect(modal.modalContainer).toHaveScreenshot(
    //   "orthographic-projection-modal-cuboid-1.png",
    //   {
    //     mask,
    //     animations: "allow",
    //   }
    // );
    // // pan to the left and check that pcds are rendered correctly
    // await modal.panSample("left");
    // await modal.modalContainer.hover();
    // await expect(modal.modalContainer).toHaveScreenshot(
    //   "orthographic-projection-modal-cuboid-1-left-pan.png",
    //   {
    //     mask,
    //     animations: "allow",
    //   }
    // );

    // await modal.navigateNextSample();
    // await modal.modalContainer.hover();
    // await expect(modal.modalContainer).toHaveScreenshot(
    //   "orthographic-projection-modal-cuboid-2.png",
    //   {
    //     mask,
    //     animations: "allow",
    //   }
    // );

    // // pan to the right and check that pcds are rendered correctly
    // await modal.panSample("right");
    // await modal.modalContainer.hover();
    // await expect(modal.modalContainer).toHaveScreenshot(
    //   "orthographic-projection-modal-cuboid-2-right-pan.png",
    //   {
    //     mask,
    //     animations: "allow",
    //   }
    // );
  });
});
