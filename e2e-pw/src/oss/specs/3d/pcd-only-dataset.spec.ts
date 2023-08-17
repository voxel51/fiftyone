import { test as base, expect } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix(
  "pcd-orthographic-projection"
);
const normalPcd = `/tmp/test-pcd1-${datasetName}.pcd`;
const pcdWithNaN = `/tmp/test-pcd2-${datasetName}.pcd`;

const test = base.extend<{ grid: GridPom; modal: ModalPom }>({
  grid: async ({ page }, use) => {
    await use(new GridPom(page));
  },
  modal: async ({ page }, use) => {
    await use(new ModalPom(page));
  },
});

test.describe("orthographic projections", () => {
  test.beforeAll(async ({ fiftyoneLoader, mediaFactory }) => {
    mediaFactory.createPcd({
      outputPath: normalPcd,
      shape: "cube",
      numPoints: 30,
    });
    mediaFactory.createPcd({
      outputPath: pcdWithNaN,
      shape: "cube",
      numPoints: 15,
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
    await expect(grid.firstFlashlightSection).toHaveScreenshot(
      "orthographic-projection-grid-cuboids.png",
      {
        animations: "allow",
        mask: [modal.locator.getByTestId("looker3d-action-bar")],
      }
    );

    // open modal and check that pcds are rendered correctly
    await grid.openFirstSample();
    await expect(modal.modalContainer).toHaveScreenshot(
      "orthographic-projection-modal-cuboid-1.png",
      {
        animations: "allow",
        mask: [modal.locator.getByTestId("looker3d-action-bar")],
      }
    );
    // pan to the right and check that pcds are rendered correctly
    await modal.panSample("right");
    await expect(modal.modalContainer).toHaveScreenshot(
      "orthographic-projection-modal-cuboid-1-right-pan.png",
      {
        animations: "allow",
        mask: [modal.locator.getByTestId("looker3d-action-bar")],
      }
    );

    await modal.navigateNextSample();
    await expect(modal.modalContainer).toHaveScreenshot(
      "orthographic-projection-modal-cuboid-2.png",
      {
        animations: "allow",
        mask: [modal.locator.getByTestId("looker3d-action-bar")],
      }
    );

    await modal.panSample("down");
    await expect(modal.modalContainer).toHaveScreenshot(
      "orthographic-projection-modal-cuboid-1-down-pan.png",
      {
        animations: "allow",
        mask: [modal.locator.getByTestId("looker3d-action-bar")],
      }
    );
  });
});
