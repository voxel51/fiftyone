import { test as base } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix("modal-main-2d-slice");
const img1Name = (scene: string) => `${scene}-img1`;
const img2Name = (scene: string) => `${scene}-img2`;
const pointCloudName = (scene: string) => `${scene}-3d`;
const groupSpecs = [1, 2].map((index) => ({ scene: `scene-${index}` }));

const test = base.extend<{
  grid: GridPom;
  modal: ModalPom;
}>({
  grid: async ({ page, eventUtils }, use) => {
    await use(new GridPom(page, eventUtils));
  },
  modal: async ({ page, eventUtils }, use) => {
    await use(new ModalPom(page, eventUtils));
  },
});

test.beforeAll(async ({ datasetFactory, foWebServer }) => {
  await foWebServer.startWebServer();
  const image =
    (fillColors: string[], name: (scene: string) => string) =>
    (groupIndex: number) => ({
      width: 320,
      height: 240,
      fillColor: fillColors[groupIndex],
      watermarkString: name(groupSpecs[groupIndex].scene),
      hideLogs: true,
    });
  await datasetFactory.createDataset({
    mediaType: "group",
    datasetName,
    numGroups: groupSpecs.length,
    slices: [
      {
        name: "img1",
        mediaType: "image",
        imageOptions: image(["#264653", "#355070"], img1Name),
      },
      {
        name: "img2",
        mediaType: "image",
        imageOptions: image(["#8d5a97", "#bc6c25"], img2Name),
      },
      {
        name: "3d",
        mediaType: "point-cloud",
        pcdOptions: (groupIndex) =>
          groupIndex === 0
            ? { shape: "cube", numPoints: 216 }
            : { shape: "diagonal", numPoints: 18 },
      },
    ],
    schema: { name: "StringField", scene: "StringField" },
    withSampleData: ({ groupIndex, slice }) => {
      const { scene } = groupSpecs[groupIndex];
      const names: Record<string, (scene: string) => string> = {
        img1: img1Name,
        img2: img2Name,
        "3d": pointCloudName,
      };
      return { name: names[slice](scene), scene };
    },
  });
});

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test.describe.serial("navigation slice integrity", () => {
  test.beforeEach(async ({ page, fiftyoneLoader }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
  });

  test.afterEach(async ({ modal, page }) => {
    await modal.close({ ignoreError: true });
    await page.reload();
  });

  test("keeps the same main 2d viewer when opening from image or 3d grid slices", async ({
    grid,
    modal,
  }) => {
    const expectedFirstGroup = groupSpecs[0];

    /** Run `open`, then check both viewers show the group */
    const assertMain2dAnd3dAreVisible = async (
      open: () => Promise<unknown>,
    ) => {
      await modal.looker3dControls.afterAllAssetsLoaded(() =>
        modal.afterSampleLoaded(open, true),
      );
      await modal.assert.verifyHasNoViewerError();
      await modal.assert.verifyPrimary2dRendererVisible();
      await modal.assert.verify3dRendererVisible();
      await modal.sampleCanvas3d.assert.hasScreenshot("main-3d.png");
    };

    await grid.sliceSelector.assert.verifyActiveSlice("img1");
    await grid.assert.isEntryCountTextEqualTo(
      `${groupSpecs.length} groups with slice`,
    );

    const firstGroup = {
      "group.name": "img1",
      name: img1Name(expectedFirstGroup.scene),
      scene: expectedFirstGroup.scene,
    };
    await modal.sidebar.afterEntries(firstGroup, () =>
      assertMain2dAnd3dAreVisible(() => grid.openFirstSample()),
    );
    await modal.assert.verifyModalSamplePluginTitle("img1", {
      pinned: true,
    });
    await modal.sidebar.assert.verifySidebarEntryTexts(firstGroup);
    await modal.assert.verifyPrimary2dRendererVisible();
    await modal.groupSampleCanvas.assert.hasScreenshot("main-2d.png");

    await modal.close();
    await grid.selectSlice("3d");
    await grid.sliceSelector.assert.verifyActiveSlice("3d");
    await grid.assert.isEntryCountTextEqualTo(
      `${groupSpecs.length} groups with slice`,
    );

    await assertMain2dAnd3dAreVisible(() => grid.openFirstSample());
    // the 2D pane shows the same image it showed with the image slice active
    await modal.assert.verifyPrimary2dRendererVisible();
    await modal.groupSampleCanvas.assert.hasScreenshot("main-2d.png");
  });
});
