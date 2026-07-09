/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Entering Annotate clears the Explore 3D selection (Recoil `selectedLabelMap`),
 * so a cuboid selected in Explore doesn't stay highlighted in Annotate. 3D
 * selection has no DOM signal, so the looker3d container exposes the Explore
 * selection count via `data-cy-selected-label-count`: select the seeded cuboid
 * in Explore (count -> 1), switch to Annotate, assert it drops to 0.
 */
import { expect, test as base } from "src/oss/fixtures";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix(
  "annotate-3d-selection-clear",
);

/** Fixed ObjectId addressing the first sample (so we can deep-link the modal). */
const id = "000000000000000000000000";
const plyPath = `/tmp/${datasetName}.ply`;
const scenePath = `/tmp/${datasetName}.fo3d`;

const test = base.extend<{ modal: ModalPom }>({
  modal: async ({ page, eventUtils }, use) => {
    await use(new ModalPom(page, eventUtils));
  },
});

test.beforeAll(async ({ foWebServer, mediaFactory }) => {
  await foWebServer.startWebServer();
  mediaFactory.createPly({ outputPath: plyPath, shape: "cube" });
  mediaFactory.createFo3d({ outputPath: scenePath, plyPath });
});

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

const looker3d = (modal: ModalPom) => modal.locator.getByTestId("looker3d");

/** Number of Explore-selected labels, read off the looker3d test affordance. */
const selectedCount = async (modal: ModalPom) => {
  const raw = await looker3d(modal).getAttribute(
    "data-cy-selected-label-count",
  );
  return Number(raw ?? "0");
};

test.describe
  .serial("3d explore selection does not bleed into annotate", () => {
  test.beforeEach(async ({ annotate3dSDK, fiftyoneLoader, modal, page }) => {
    await annotate3dSDK.seed({
      datasetName,
      scenePaths: [scenePath],
      classes: ["car", "truck", "pedestrian"],
      cuboidSampleIndices: [0],
    });

    await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
      searchParams: new URLSearchParams({ id }),
    });
    await modal.assert.isOpen();

    // the modal opens in EXPLORE; wait for the 3D scene to be interactable
    await modal.annotate3d.waitForSurface();
  });

  test("selecting a cuboid in explore then switching to annotate clears the selection", async ({
    modal,
    page,
  }) => {
    // look straight down the Z axis so the seeded cuboid (centered at the
    // origin) sits under the canvas center, then click it to select in Explore
    await modal.looker3dControls.setTopView();
    await expect.poll(async () => selectedCount(modal)).toBe(0);

    const box = await modal.annotate3d.canvas.boundingBox();
    if (!box) {
      throw new Error("3D canvas has no bounding box");
    }
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

    // the Explore selection landed: exactly one selected label
    await expect.poll(async () => selectedCount(modal)).toBe(1);

    // switching to Annotate must clear the Explore selection (no bleed)
    await modal.sidebar.switchMode("annotate");
    await modal.annotate3d.waitForSurface();
    await expect.poll(async () => selectedCount(modal)).toBe(0);
  });

  test("annotate selection replaces rather than stacks", async ({
    modal,
    page,
  }) => {
    // seed an Explore selection first, then enter Annotate (which clears it)
    await modal.looker3dControls.setTopView();
    const box = await modal.annotate3d.canvas.boundingBox();
    if (!box) {
      throw new Error("3D canvas has no bounding box");
    }
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect.poll(async () => selectedCount(modal)).toBe(1);

    await modal.sidebar.switchMode("annotate");
    await modal.annotate3d.waitForSurface();
    await expect.poll(async () => selectedCount(modal)).toBe(0);

    // selecting an annotate label arms the engine anchor without re-populating
    // the Explore selection map — so it stays at 0 (no stacking on top of a
    // stale Explore highlight)
    await modal.annotate3d.selectLabel("car");
    await modal.sidebar.edit.assert.verifyFieldValue("label", "car");
    await expect.poll(async () => selectedCount(modal)).toBe(0);
  });
});
