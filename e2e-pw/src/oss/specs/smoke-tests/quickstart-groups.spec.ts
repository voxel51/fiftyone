import { test as base, expect } from "src/oss/fixtures";
import { Asset3dPanelPom } from "src/oss/poms/fo3d/assets-panel";
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
  asset3dPanel: Asset3dPanelPom;
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
  asset3dPanel: async ({ page }, use) => {
    await use(new Asset3dPanelPom(page));
  },
});

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test.beforeAll(async ({ fiftyoneLoader, foWebServer }) => {
  await foWebServer.startWebServer();

  await fiftyoneLoader.loadZooDataset("quickstart-groups", datasetName, {
    max_samples: 12,
  });
});

test.describe.serial("quickstart-groups", () => {
  test.beforeEach(async ({ page, fiftyoneLoader }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
  });

  test.afterEach(async ({ page, modal }) => {
    await modal.close({ ignoreError: true });
    await page.reload();
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

    test('changes slice to "pcd" when 3D viewer is clicked', async ({
      modal,
    }) => {
      await modal.assert.verifyModalSamplePluginTitle("left", { pinned: true });
      await modal.clickOnLooker3d();
      await modal.assert.verifyModalSamplePluginTitle("pcd", { pinned: true });
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

      await modal.sidebar.toggleSidebarGroup("GROUP");
      await modal.navigateSlice("group.name", "right");
      await modal.navigateNextSample();
      expect(await modal.sidebar.getSidebarEntryText("group.name")).toEqual(
        "right"
      );
    });

    test("group media visibility toggle works", async ({ modal }) => {
      // make sure popout is right aligned to the toggle button
      await modal.group.toggleMediaButton.click();

      // const popoutBoundingBox =
      //   await modal.group.groupMediaVisibilityPopout.boundingBox();
      // const toggleButtonBoundingBox =
      //   await modal.group.toggleMediaButton.boundingBox();

      // todo: alignment is off by a bit, fix it later
      // expect(popoutBoundingBox.x + popoutBoundingBox.width).toBeCloseTo(
      //   toggleButtonBoundingBox.x + toggleButtonBoundingBox.width,
      //   0
      // );

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
});
