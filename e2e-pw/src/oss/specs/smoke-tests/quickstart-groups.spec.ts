import { test as base, expect } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix("quickstart-groups");

const test = base.extend<{ grid: GridPom; modal: ModalPom }>({
  grid: async ({ page }, use) => {
    await use(new GridPom(page));
  },
  modal: async ({ page }, use) => {
    await use(new ModalPom(page));
  },
});

test.describe("quickstart-groups dataset", () => {
  test.beforeAll(async ({ fiftyoneLoader }) => {
    await fiftyoneLoader.loadZooDataset("quickstart-groups", datasetName, {
      max_samples: 12,
    });
  });

  test.beforeEach(async ({ page, fiftyoneLoader }) => {
    await fiftyoneLoader.waitUntilLoad(page, datasetName);
  });

  test("should have four lookers with 'left' as default slice", async ({
    grid,
    page,
  }) => {
    await grid.assert.verifyNLookers(4);

    const selectorSlice = page.getByTestId("selector-slice");
    await expect(selectorSlice).toHaveValue("left");
  });

  test.describe("group modal", () => {
    test.beforeEach(async ({ grid }) => {
      await grid.openFirstLooker();
    });

    test("shows correct pinned slice in modal", async ({ modal }) => {
      expect(await modal.getGroupPinnedText()).toEqual("left is pinned");
    });

    test('changes slice to "pcd" when 3D viewer is clicked', async ({
      modal,
    }) => {
      await modal.clickOnLooker3d();
      expect(await modal.getGroupPinnedText()).toBe("pcd is pinned");
    });
  });
});
