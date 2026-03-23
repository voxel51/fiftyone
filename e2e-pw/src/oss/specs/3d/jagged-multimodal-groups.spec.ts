import fs from "node:fs";
import { expect, test as base } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix("jagged-multimodal-groups");
const sharedMeshPath = `/tmp/jagged-multimodal-groups-${datasetName}-mesh.ply`;
const groupSpecs = [
  {
    scene: "scene-1",
    slices: ["pcd"],
  },
  {
    scene: "scene-2",
    slices: ["left", "pcd"],
  },
  {
    scene: "scene-3",
    slices: ["right", "pcd"],
  },
  {
    scene: "scene-4",
    slices: ["left", "right", "pcd"],
  },
].map((spec, index) => ({
  ...spec,
  leftPath: spec.slices.includes("left")
    ? `/tmp/jagged-multimodal-groups-${datasetName}-${spec.scene}-left.png`
    : null,
  rightPath: spec.slices.includes("right")
    ? `/tmp/jagged-multimodal-groups-${datasetName}-${spec.scene}-right.png`
    : null,
  pcdPath: spec.slices.includes("pcd")
    ? `/tmp/jagged-multimodal-groups-${datasetName}-${spec.scene}-pcd.fo3d`
    : null,
  leftName: `${spec.scene}-left`,
  rightName: `${spec.scene}-right`,
  pcdName: `${spec.scene}-pcd`,
  offset: index * 0.3,
}));

const TEMP_FILE_PATHS = [
  sharedMeshPath,
  ...groupSpecs.flatMap((spec) =>
    [spec.leftPath, spec.rightPath, spec.pcdPath].filter(Boolean)
  ),
];

const test = base.extend<{ grid: GridPom; modal: ModalPom }>({
  grid: async ({ page, eventUtils }, use) => {
    await use(new GridPom(page, eventUtils));
  },
  modal: async ({ page, eventUtils }, use) => {
    await use(new ModalPom(page, eventUtils));
  },
});

test.beforeAll(async ({ fiftyoneLoader, foWebServer, mediaFactory }) => {
  await foWebServer.startWebServer();

  mediaFactory.createPly({
    outputPath: sharedMeshPath,
    shape: "cube",
    color: [255, 196, 96],
  });

  await Promise.all(
    groupSpecs.flatMap((spec, index) => {
      const imageFillColors = ["#264653", "#3d405b", "#6d597a", "#355070"];

      return [
        spec.leftPath &&
          mediaFactory.createBlankImage({
            outputPath: spec.leftPath,
            width: 320,
            height: 240,
            fillColor: imageFillColors[index],
            watermarkString: spec.leftName,
            hideLogs: true,
          }),
        spec.rightPath &&
          mediaFactory.createBlankImage({
            outputPath: spec.rightPath,
            width: 320,
            height: 240,
            fillColor: imageFillColors[(index + 1) % imageFillColors.length],
            watermarkString: spec.rightName,
            hideLogs: true,
          }),
      ].filter(Boolean);
    })
  );

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
dataset.add_group_field("group", default="left")
seed_group_media_types(
    dataset,
    {
        "left": fom.IMAGE,
        "right": fom.IMAGE,
        "pcd": fom.THREE_D,
    },
)
dataset.persistent = True

samples = []
for spec in specs:
    group = fo.Group()

    if spec["leftPath"]:
        samples.append(
            fo.Sample(
                filepath=spec["leftPath"],
                group=group.element("left"),
                name=spec["leftName"],
                scene=spec["scene"],
            )
        )

    if spec["rightPath"]:
        samples.append(
            fo.Sample(
                filepath=spec["rightPath"],
                group=group.element("right"),
                name=spec["rightName"],
                scene=spec["scene"],
            )
        )

    if spec["pcdPath"]:
        scene = fo.Scene()
        mesh = fo.PlyMesh(spec["pcdName"], "${sharedMeshPath}")
        mesh.position = [spec["offset"], 0.0, 0.1]
        mesh.scale = 0.9
        scene.add(mesh)
        scene.write(spec["pcdPath"])

        samples.append(
            fo.Sample(
                filepath=spec["pcdPath"],
                media_type="3d",
                group=group.element("pcd"),
                name=spec["pcdName"],
                scene=spec["scene"],
            )
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

test.describe.serial("jagged multimodal groups", () => {
  test.beforeEach(async ({ page, fiftyoneLoader }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
  });

  test("opens a pcd-only group from the pcd grid slice without throwing", async ({
    grid,
    modal,
  }) => {
    await grid.selectSlice("pcd");
    await grid.assert.isEntryCountTextEqualTo("4 groups with slice");

    await grid.openFirstSample();
    await modal.waitForSampleLoadDomAttribute(true);
    await modal.looker3dControls.waitForAllAssetsLoaded();
    await expect(
      modal.modalContainer.getByTestId("looker-error-info")
    ).toHaveCount(0);
    await modal.sidebar.assert.waitUntilSidebarEntryTextEqualsMultiple({
      "group.name": "pcd",
      name: groupSpecs[0].pcdName,
      scene: groupSpecs[0].scene,
    });

    await modal.navigateNextSample(true);
    await modal.looker3dControls.waitForAllAssetsLoaded();
    await expect(
      modal.modalContainer.getByTestId("looker-error-info")
    ).toHaveCount(0);
    await modal.sidebar.assert.waitUntilSidebarEntryTextEqualsMultiple({
      "group.name": "pcd",
      name: groupSpecs[1].pcdName,
      scene: groupSpecs[1].scene,
    });
  });

  test("opens the first modal cleanly from every grid slice", async ({
    page,
    grid,
    modal,
  }) => {
    const selectorSlice = page.getByTestId("selector-slice");
    const assertModalHasNoViewerError = async ({
      is3dSlice,
    }: {
      is3dSlice: boolean;
    }) => {
      if (is3dSlice) {
        await modal.looker3dControls.waitForAllAssetsLoaded();
      }

      await expect(
        modal.modalContainer.getByTestId("looker-error-info")
      ).toHaveCount(0);
    };
    const sliceExpectations = [
      {
        slice: "left",
        entryCount: "2 groups with slice",
        expectedName: groupSpecs[1].leftName,
        expectedScene: groupSpecs[1].scene,
        expectedAnnotationSlices: ["left", "pcd"],
      },
      {
        slice: "right",
        entryCount: "2 groups with slice",
        expectedName: groupSpecs[2].rightName,
        expectedScene: groupSpecs[2].scene,
        expectedAnnotationSlices: ["right", "pcd"],
      },
      {
        slice: "pcd",
        entryCount: "4 groups with slice",
        expectedName: groupSpecs[0].pcdName,
        expectedScene: groupSpecs[0].scene,
        expectedAnnotationSlices: ["pcd"],
      },
    ];

    for (const {
      slice,
      entryCount,
      expectedName,
      expectedScene,
      expectedAnnotationSlices,
    } of sliceExpectations) {
      await selectorSlice.click();
      await page.getByTestId(`selector-result-${slice}`).click();

      await expect(selectorSlice).toHaveValue(slice);
      await grid.assert.isEntryCountTextEqualTo(entryCount);

      await grid.openFirstSample();
      await modal.waitForSampleLoadDomAttribute(true);
      await assertModalHasNoViewerError({ is3dSlice: slice === "pcd" });
      await modal.sidebar.assert.waitUntilSidebarEntryTextEqualsMultiple({
        "group.name": slice,
        name: expectedName,
        scene: expectedScene,
      });

      await modal.sidebar.switchMode("annotate");
      await modal.sidebar.annotate.assert.verifyAvailableAnnotationSlices(
        expectedAnnotationSlices
      );
      await expect(modal.sidebar.annotate.annotationSliceSelector).toHaveValue(
        slice
      );
      await assertModalHasNoViewerError({ is3dSlice: slice === "pcd" });

      await modal.sidebar.switchMode("explore");
      await assertModalHasNoViewerError({ is3dSlice: slice === "pcd" });
      await modal.sidebar.assert.waitUntilSidebarEntryTextEquals(
        "group.name",
        slice
      );

      await modal.sidebar.switchMode("annotate");
      await modal.sidebar.annotate.assert.verifyAvailableAnnotationSlices(
        expectedAnnotationSlices
      );
      await expect(modal.sidebar.annotate.annotationSliceSelector).toHaveValue(
        slice
      );
      await assertModalHasNoViewerError({ is3dSlice: slice === "pcd" });

      await modal.sidebar.switchMode("explore");
      await assertModalHasNoViewerError({ is3dSlice: slice === "pcd" });
      await modal.sidebar.assert.waitUntilSidebarEntryTextEquals(
        "group.name",
        slice
      );

      await modal.close();
      await expect(modal.locator).toBeHidden();
    }
  });
});
