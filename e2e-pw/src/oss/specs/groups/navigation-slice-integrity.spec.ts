import fs from "node:fs";
import { test as base } from "src/oss/fixtures";
import { Renderer3dPom } from "src/oss/poms/fo3d/renderer-3d";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix("modal-main-2d-slice");
const groupSpecs = [1, 2].map((index) => ({
  scene: `scene-${index}`,
  img1Path: `/tmp/modal-main-2d-slice-${datasetName}-${index}-img1.png`,
  img2Path: `/tmp/modal-main-2d-slice-${datasetName}-${index}-img2.png`,
  pointCloudPath: `/tmp/modal-main-2d-slice-${datasetName}-${index}-3d.pcd`,
  img1Name: `scene-${index}-img1`,
  img2Name: `scene-${index}-img2`,
  pointCloudName: `scene-${index}-3d`,
}));
const TEMP_FILE_PATHS = groupSpecs.flatMap((spec) => [
  spec.img1Path,
  spec.img2Path,
  spec.pointCloudPath,
]);

const test = base.extend<{
  grid: GridPom;
  modal: ModalPom;
  renderer3d: Renderer3dPom;
}>({
  grid: async ({ page, eventUtils }, use) => {
    await use(new GridPom(page, eventUtils));
  },
  modal: async ({ page, eventUtils }, use) => {
    await use(new ModalPom(page, eventUtils));
  },
  renderer3d: async ({ page }, use) => {
    await use(new Renderer3dPom(page));
  },
});

test.beforeAll(async ({ fiftyoneLoader, foWebServer, mediaFactory }) => {
  await foWebServer.startWebServer();

  await Promise.all(
    groupSpecs.flatMap((spec, index) => [
      mediaFactory.createBlankImage({
        outputPath: spec.img1Path,
        width: 320,
        height: 240,
        fillColor: ["#264653", "#355070"][index],
        watermarkString: spec.img1Name,
        hideLogs: true,
      }),
      mediaFactory.createBlankImage({
        outputPath: spec.img2Path,
        width: 320,
        height: 240,
        fillColor: ["#8d5a97", "#bc6c25"][index],
        watermarkString: spec.img2Name,
        hideLogs: true,
      }),
    ])
  );

  groupSpecs.forEach((spec, index) => {
    mediaFactory.createPcd({
      outputPath: spec.pointCloudPath,
      shape: index === 0 ? "cube" : "diagonal",
      numPoints: index === 0 ? 216 : 18,
    });
  });

  await fiftyoneLoader.executePythonCode(`
import json

import fiftyone as fo
import fiftyone.core.media as fom

specs = json.loads(r'''${JSON.stringify(groupSpecs)}''')

def seed_group_media_types(dataset, group_media_types):
    current = dict(dataset._doc.group_media_types or {})
    current.update(group_media_types)
    dataset._doc.group_media_types = current
    dataset.save()

dataset = fo.Dataset("${datasetName}")
dataset.add_group_field("group", default="img1")
seed_group_media_types(
    dataset,
    {
        "img1": fom.IMAGE,
        "img2": fom.IMAGE,
        "3d": fom.POINT_CLOUD,
    },
)
dataset.persistent = True

samples = []
for spec in specs:
    group = fo.Group()
    samples.extend(
        [
            fo.Sample(
                filepath=spec["img1Path"],
                group=group.element("img1"),
                name=spec["img1Name"],
                scene=spec["scene"],
            ),
            fo.Sample(
                filepath=spec["img2Path"],
                group=group.element("img2"),
                name=spec["img2Name"],
                scene=spec["scene"],
            ),
            fo.Sample(
                filepath=spec["pointCloudPath"],
                media_type="point-cloud",
                group=group.element("3d"),
                name=spec["pointCloudName"],
                scene=spec["scene"],
            ),
        ]
    )

dataset.add_samples(samples)
  `);
});

test.afterAll(async ({ fiftyoneLoader, foWebServer }) => {
  try {
    await fiftyoneLoader.executePythonCode(`
import fiftyone as fo

if fo.dataset_exists("${datasetName}"):
    fo.delete_dataset("${datasetName}")
    `);
  } catch (error) {
    void error;
  }

  try {
    await foWebServer.stopWebServer();
  } catch (error) {
    void error;
  }

  TEMP_FILE_PATHS.forEach((filePath) => {
    try {
      fs.rmSync(filePath, { force: true });
    } catch (error) {
      void error;
    }
  });
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
    renderer3d,
  }) => {
    const expectedFirstGroup = groupSpecs[0];

    const assertMain2dAnd3dAreVisible = async () => {
      await modal.waitForSampleLoadDomAttribute(true);
      await modal.looker3dControls.waitForAllAssetsLoaded();
      await modal.assert.verifyHasNoViewerError();
      await modal.assert.verifyPrimary2dRendererVisible();
      await modal.assert.verify3dRendererVisible();
      await renderer3d.assert.expectSomethingToRender();
    };

    await grid.sliceSelector.assert.verifyActiveSlice("img1");
    await grid.assert.isEntryCountTextEqualTo("2 groups with slice");

    await grid.openFirstSample();
    await assertMain2dAnd3dAreVisible();
    await modal.assert.verifyModalSamplePluginTitle("img1", {
      pinned: true,
    });
    await modal.sidebar.assert.waitUntilSidebarEntryTextEqualsMultiple({
      "group.name": "img1",
      name: expectedFirstGroup.img1Name,
      scene: expectedFirstGroup.scene,
    });
    const expectedMain2dScreenshot =
      await modal.captureStableMain2DRendererScreenshot();

    await modal.close();
    await grid.selectSlice("3d");
    await grid.sliceSelector.assert.verifyActiveSlice("3d");
    await grid.assert.isEntryCountTextEqualTo("2 groups with slice");

    await grid.openFirstSample();
    await assertMain2dAnd3dAreVisible();
    await modal.assert.verifyMain2RendererMatchesScreenshotBuffer(
      expectedMain2dScreenshot
    );
  });
});
