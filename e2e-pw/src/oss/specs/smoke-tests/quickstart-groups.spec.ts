import { test as base, expect } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { SidebarPom } from "src/oss/poms/sidebar";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix("quickstart-groups");

const FIRST_SAMPLE_FILENAME = "003037.png";
const SECOND_SAMPLE_FILENAME = "007195.png";

const test = base.extend<{
  grid: GridPom;
  modal: ModalPom;
  sidebar: SidebarPom;
}>({
  grid: async ({ page, eventUtils }, use) => {
    await use(new GridPom(page, eventUtils));
  },
  modal: async ({ page, eventUtils }, use) => {
    await use(new ModalPom(page, eventUtils));
  },
  sidebar: async ({ page }, use) => {
    await use(new SidebarPom(page));
  },
});

test.describe("quickstart-groups", () => {
  test.beforeAll(async ({ fiftyoneLoader }) => {
    await fiftyoneLoader.executePythonCode(
      `
        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("quickstart-groups")
        dataset.persistent = True

        step = 25
        for slice in dataset.group_slices:
            dataset.group_slice = slice
            scene_id = 0
            order_by = 0
            for sample in dataset:
                sample.set_field("scene_id", scene_id // step)
                sample.set_field("timestamp", order_by % step)
                sample.save()
                scene_id += 1
                order_by += 1

        view = dataset.group_by("scene_id", order_by="timestamp")
        dataset.save_view("dynamic", view)
        `
    );
  });

  test("should have four lookers with 'left' as default slice", async ({
    fiftyoneLoader,
    grid,
    page,
  }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
    await grid.assert.isLookerCountEqualTo(4);
    const selectorSlice = page.getByTestId("selector-slice");
    await expect(selectorSlice).toHaveValue("left");
  });

  test("entry counts works", async ({ fiftyoneLoader, grid, page }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
    expect(await grid.getEntryCountText()).toEqual("200 groups with slice");

    await grid.actionsRow.toggleDisplayOptions();
    await grid.actionsRow.displayActions.setSidebarStatisticsMode("group");

    // note: entry-counts might take a while to change, which is why we're asserting using polling
    await grid.assert.isEntryCountTextEqualTo(
      "(600 samples) 200 groups with slice"
    );
  });

  test.describe("modal", () => {
    test.beforeEach(async ({ fiftyoneLoader, grid, modal, page }) => {
      await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
      await grid.openFirstSample();
      await modal.waitForSampleLoadDomAttribute();
    });

    test('changes slice to "pcd" when 3D viewer is clicked', async ({
      modal,
    }) => {
      await modal.group.assert.assertGroupPinnedText("left is pinned");
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

    test("group media visibility toggle works", async ({ modal }) => {
      // make sure popout is right aligned to the toggle button
      await modal.group.toggleMediaButton.click();
      const popoutBoundingBox =
        await modal.group.groupMediaVisibilityPopout.boundingBox();
      const toggleButtonBoundingBox =
        await modal.group.toggleMediaButton.boundingBox();

      expect(popoutBoundingBox.x + popoutBoundingBox.width).toBeCloseTo(
        toggleButtonBoundingBox.x + toggleButtonBoundingBox.width,
        0
      );

      await expect(modal.looker3d).toBeVisible();
      await modal.group.toggleMedia("3d");
      await expect(modal.looker3d).toBeHidden();
      await modal.group.toggleMedia("3d");
      await expect(modal.looker3d).toBeVisible();

      await expect(modal.groupLooker).toBeVisible();
      await modal.group.toggleMedia("viewer");
      await expect(modal.groupLooker).toBeHidden();
      await modal.group.toggleMedia("viewer");
      await expect(modal.groupLooker).toBeVisible();

      await expect(modal.carousel).toBeVisible();
      await modal.group.toggleMedia("carousel");
      await expect(modal.carousel).toBeHidden();
      await modal.group.toggleMedia("carousel");
      await expect(modal.carousel).toBeVisible();
    });
  });

  test("modal with grid filter", async ({
    modal,
    grid,
    sidebar,
    eventUtils,
  }) => {
    let entryExpandPromise = eventUtils.getEventReceivedPromiseForPredicate(
      "animation-onRest",
      () => true
    );
    await sidebar.toggleSidebarGroup("GROUP");
    await entryExpandPromise;

    entryExpandPromise = eventUtils.getEventReceivedPromiseForPredicate(
      "animation-onRest",
      () => true
    );
    await sidebar.clickFieldDropdown("group.name");
    await entryExpandPromise;

    const promise = grid.getWaitForGridRefreshPromise();
    await sidebar.applyFilter("left");
    await promise;

    await grid.openFirstSample();
    await modal.waitForSampleLoadDomAttribute();

    await modal.navigateSlice("group.name", "right");
    await modal.sidebar.assert.verifySidebarEntryText("group.name", "right");
  });

  test("dynamic groups", async ({ fiftyoneLoader, grid, modal, page }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
      savedView: "dynamic",
    });
    await grid.assert.isEntryCountTextEqualTo("8 groups with slice");
    await grid.assert.isLookerCountEqualTo(8);

    await grid.openFirstSample();
    await modal.group.assert.assertGroupPinnedText("left is pinned");
    await modal.sidebar.assert.verifySidebarEntryText("group.name", "left");
    await modal.group.assert.assertIsCarouselVisible();
    await modal.navigateSlice("group.name", "right");
    await modal.sidebar.assert.verifySidebarEntryText("group.name", "left");

    await modal.clickOnLooker3d();
    await modal.group.assert.assertGroupPinnedText("pcd is pinned");
    await modal.sidebar.assert.verifySidebarEntryText("group.name", "pcd");
  });
});
