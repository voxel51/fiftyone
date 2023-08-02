import { test as base, expect } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix("quickstart-groups");

const FIRST_SAMPLE_FILENAME = "003037.png";
const SECOND_SAMPLE_FILENAME = "007195.png";

const test = base.extend<{ grid: GridPom; modal: ModalPom }>({
  grid: async ({ page }, use) => {
    await use(new GridPom(page));
  },
  modal: async ({ page }, use) => {
    await use(new ModalPom(page));
  },
});

test.describe("quickstart-groups", () => {
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

  test("entry counts works", async ({ grid }) => {
    expect(await grid.getEntryCountText()).toEqual("4 groups");

    await grid.actionsRow.openDisplayOptions();
    await grid.actionsRow.displayActions.setSidebarStatisticsMode("group");

    // note: entry-counts might take a while to change, which is why we're asserting using polling
    await grid.assert.waitForEntryCountTextToEqual("4 groups (12 samples)");
  });

  test.describe("modal", () => {
    test.beforeEach(async ({ modal, grid }) => {
      await grid.openFirstLooker();
      await modal.waitForSampleToLoad();
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

    test("navigation works", async ({ modal }) => {
      expect(await modal.sidebarPom.getSampleFilepath(false)).toEqual(
        FIRST_SAMPLE_FILENAME
      );

      await modal.navigateNextSample();

      expect(await modal.sidebarPom.getSampleFilepath(false)).toEqual(
        SECOND_SAMPLE_FILENAME
      );

      await modal.navigatePreviousSample();

      expect(await modal.sidebarPom.getSampleFilepath(false)).toEqual(
        FIRST_SAMPLE_FILENAME
      );
    });
  });
});
