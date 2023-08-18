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
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
  });

  test("should have four lookers with 'left' as default slice", async ({
    grid,
    page,
  }) => {
    await grid.assert.isLookerCountEqualTo(4);
    const selectorSlice = page.getByTestId("selector-slice");
    await expect(selectorSlice).toHaveValue("left");
  });

  test("entry counts works", async ({ grid }) => {
    expect(await grid.getEntryCountText()).toEqual("4 groups with slice");

    await grid.actionsRow.toggleDisplayOptions();
    await grid.actionsRow.displayActions.setSidebarStatisticsMode("group");

    // note: entry-counts might take a while to change, which is why we're asserting using polling
    await grid.assert.isEntryCountTextEqualTo(
      "(12 samples) 4 groups with slice"
    );
  });

  test.describe("modal", () => {
    test.beforeEach(async ({ modal, grid }) => {
      await grid.openFirstSample();
      await modal.waitForSampleLoadDomAttribute();
    });

    test("shows correct pinned slice in modal", async ({ modal }) => {
      await modal.group.assert.assertGroupPinnedText("left is pinned");
    });

    test('changes slice to "pcd" when 3D viewer is clicked', async ({
      modal,
    }) => {
      await modal.clickOnLooker3d();
      await modal.group.assert.assertGroupPinnedText("pcd is pinned");
    });

    test("navigation works", async ({ modal }) => {
      expect(await modal.sidebar.getSampleFilepath(false)).toEqual(
        FIRST_SAMPLE_FILENAME
      );

      await modal.navigateNextSample();

      expect(await modal.sidebar.getSampleFilepath(false)).toEqual(
        SECOND_SAMPLE_FILENAME
      );

      await modal.navigatePreviousSample();

      expect(await modal.sidebar.getSampleFilepath(false)).toEqual(
        FIRST_SAMPLE_FILENAME
      );
    });
  });
});
