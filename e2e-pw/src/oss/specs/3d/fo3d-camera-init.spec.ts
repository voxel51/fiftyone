import { test as base, expect } from "src/oss/fixtures";
import {
  positionsAreClose,
  Renderer3dPom,
} from "src/oss/poms/fo3d/renderer-3d";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

import fs from "node:fs";
import {
  getPlyCube,
  getPlyPointCloud,
} from "./fo3d-ascii-asset-factory/ply-factory";

/**
 * Camera initialization e2e tests.
 *
 * Validates that the 3D viewer initializes the camera correctly from various
 * sources, and that the camera position persists across sample navigations.
 */

/** The default fallback camera position when no other source is available. */
const DEFAULT_CAMERA_POSITION: [number, number, number] = [0, 5, -5];

// ─── dataset: no camera props (bbox-based init) ────────────────────────────

const basicDatasetName = getUniqueDatasetNameWithPrefix("cam-init-basic");
const basicPlyMeshPath = `/tmp/cam-init-mesh-${basicDatasetName}.ply`;
const basicPlyPcdPath = `/tmp/cam-init-pcd-${basicDatasetName}.ply`;
const basicScenePath = `/tmp/cam-init-scene-${basicDatasetName}.fo3d`;

// ─── dataset: explicit camera position in fo3d ─────────────────────────────

const scenePosDatasetName = getUniqueDatasetNameWithPrefix("cam-init-scenepos");
const scenePosScenePath = `/tmp/cam-init-scenepos-${scenePosDatasetName}.fo3d`;

// Camera position and lookAt defined in the fo3d scene
const SCENE_CAMERA_POSITION: [number, number, number] = [15, 10, 20];
const SCENE_CAMERA_LOOK_AT: [number, number, number] = [1, 2, 3];

// ─── test setup ────────────────────────────────────────────────────────────

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

test.beforeAll(async ({ fiftyoneLoader, foWebServer }) => {
  await foWebServer.startWebServer();

  // Write PLY assets to disk (reused across both datasets)
  fs.writeFileSync(basicPlyMeshPath, getPlyCube());
  fs.writeFileSync(basicPlyPcdPath, getPlyPointCloud());

  // ── Dataset 1: no camera props → camera should init from bbox ──
  await fiftyoneLoader.executePythonCode(`
import fiftyone as fo

dataset = fo.Dataset("${basicDatasetName}")
dataset.persistent = True

scene = fo.Scene()
mesh = fo.PlyMesh("mesh", "${basicPlyMeshPath}")
mesh.scale = 2
scene.add(mesh)

pcd = fo.PlyMesh("pcd", "${basicPlyPcdPath}", is_point_cloud=True)
pcd.position = [-1, 0, 0]
scene.add(pcd)

scene.write("${basicScenePath}")

sample1 = fo.Sample(filepath="${basicScenePath}", name="sample1")
sample2 = fo.Sample(filepath="${basicScenePath}", name="sample2")
dataset.add_samples([sample1, sample2])
  `);

  // ── Dataset 2: explicit camera.position + camera.look_at in fo3d ──
  await fiftyoneLoader.executePythonCode(`
import fiftyone as fo

dataset = fo.Dataset("${scenePosDatasetName}")
dataset.persistent = True

scene = fo.Scene()
mesh = fo.PlyMesh("mesh", "${basicPlyMeshPath}")
scene.add(mesh)

scene.camera = fo.PerspectiveCamera(
    position=${JSON.stringify(SCENE_CAMERA_POSITION)},
    look_at=${JSON.stringify(SCENE_CAMERA_LOOK_AT)},
)

scene.write("${scenePosScenePath}")

sample = fo.Sample(filepath="${scenePosScenePath}", name="sample-with-cam")
dataset.add_samples([sample])
  `);
});

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

// ─── tests ─────────────────────────────────────────────────────────────────

test.describe.serial("camera initialization", () => {
  test("fresh load computes camera from bounding box", async ({
    page,
    grid,
    modal,
    renderer3d,
    fiftyoneLoader,
  }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, basicDatasetName);

    // Ensure no saved camera state exists
    await renderer3d.clearSavedCameraState(basicDatasetName);

    await grid.openFirstSample();
    await modal.looker3dControls.waitForAllAssetsLoaded();

    await expect
      .poll(
        async () =>
          positionsAreClose(
            await renderer3d.getCameraPosition(),
            DEFAULT_CAMERA_POSITION
          ),
        { timeout: 10000 }
      )
      .toBe(false);

    const position = await renderer3d.getCameraPosition();

    // The computed position should be finite and reasonable
    expect(Number.isFinite(position[0])).toBe(true);
    expect(Number.isFinite(position[1])).toBe(true);
    expect(Number.isFinite(position[2])).toBe(true);
  });

  test("camera position persists between sample navigations", async ({
    page,
    grid,
    modal,
    renderer3d,
    fiftyoneLoader,
  }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, basicDatasetName);
    await grid.openFirstSample();
    await modal.looker3dControls.waitForAllAssetsLoaded();

    const cameraBefore = await renderer3d.getCameraPosition();

    // Wait until saved camera state matches the live camera.
    // localStorage can briefly contain an early fallback value.
    await expect
      .poll(async () => {
        const saved = await renderer3d.getSavedCameraState(basicDatasetName);
        if (!saved) {
          return false;
        }

        return positionsAreClose(
          saved.position as [number, number, number],
          cameraBefore,
          1.0
        );
      })
      .toBe(true);

    const savedBefore = await renderer3d.getSavedCameraState(basicDatasetName);
    expect(savedBefore).not.toBeNull();
    expect(savedBefore?.position).toHaveLength(3);
    expect(savedBefore?.target).toHaveLength(3);

    const positionBefore = cameraBefore;

    // Navigate to next sample, then come back
    await modal.navigateNextSample();
    await modal.navigatePreviousSample();

    await expect
      .poll(
        async () => {
          const currentCamera = await renderer3d.getCameraPosition();
          return positionsAreClose(currentCamera, positionBefore, 1.0);
        },
        { timeout: 10000, intervals: [500] }
      )
      .toBe(true);

    const positionAfter = await renderer3d.getCameraPosition();

    expect(
      positionsAreClose(
        positionAfter as [number, number, number],
        positionBefore,
        1.0
      ),
      `Expected camera to be restored to ${positionBefore}, but got ${positionAfter}`
    ).toBe(true);
  });

  test("respects camera position from fo3d scene", async ({
    page,
    grid,
    modal,
    renderer3d,
    fiftyoneLoader,
  }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, scenePosDatasetName);

    // Clear any saved state so we start fresh
    await renderer3d.clearSavedCameraState(scenePosDatasetName);

    await grid.openFirstSample();
    await modal.looker3dControls.waitForAllAssetsLoaded();

    await expect
      .poll(
        async () =>
          positionsAreClose(
            await renderer3d.getCameraPosition(),
            SCENE_CAMERA_POSITION,
            1.0
          ),
        { timeout: 10000 }
      )
      .toBe(true);
  });

  test("camera position persists across explore/annotate mode switches", async ({
    page,
    grid,
    modal,
    renderer3d,
    fiftyoneLoader,
  }) => {
    const modeSwitchTolerance = 0.2;

    await fiftyoneLoader.waitUntilGridVisible(page, basicDatasetName);
    await renderer3d.clearSavedCameraState(basicDatasetName);

    await grid.openFirstSample();
    await modal.looker3dControls.waitForAllAssetsLoaded();
    await modal.sidebar.switchMode("explore");

    const exploreCameraBefore = await renderer3d.getCameraPosition();

    await modal.sidebar.switchMode("annotate");

    await expect
      .poll(
        async () =>
          positionsAreClose(
            await renderer3d.getCameraPosition(),
            exploreCameraBefore,
            modeSwitchTolerance
          ),
        { timeout: 10000 }
      )
      .toBe(true);

    await renderer3d.dragCameraBy(10, 10);
    // eslint-disable-next-line playwright/no-wait-for-timeout
    await page.waitForTimeout(100);

    const annotateCameraAfterDrag = await renderer3d.getCameraPosition();

    await modal.sidebar.switchMode("explore");

    await expect
      .poll(
        async () =>
          positionsAreClose(
            await renderer3d.getCameraPosition(),
            annotateCameraAfterDrag,
            modeSwitchTolerance
          ),
        { timeout: 10000 }
      )
      .toBe(true);

    const exploreCameraAfterRoundTrip = await renderer3d.getCameraPosition();

    expect(
      positionsAreClose(
        exploreCameraAfterRoundTrip,
        annotateCameraAfterDrag,
        modeSwitchTolerance
      ),
      `Expected explore camera ${exploreCameraAfterRoundTrip} to match annotate camera ${annotateCameraAfterDrag}`
    ).toBe(true);
  });

  test("view changes move camera after initialization", async ({
    page,
    grid,
    modal,
    renderer3d,
    fiftyoneLoader,
  }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, basicDatasetName);

    // Clear saved state to get a fresh bbox-based init
    await renderer3d.clearSavedCameraState(basicDatasetName);

    await grid.openFirstSample();
    await modal.looker3dControls.waitForAllAssetsLoaded();

    // Record the initial camera position
    const initialPosition = await renderer3d.getCameraPosition();

    // Use a public camera action to move the camera after initialization.
    await modal.looker3dControls.setEgoView();

    await expect
      .poll(
        async () =>
          !positionsAreClose(
            await renderer3d.getCameraPosition(),
            initialPosition
          ),
        { timeout: 10000 }
      )
      .toBe(true);

    // Wait until the persisted camera state catches up with the rendered camera.
    await expect
      .poll(async () => {
        const currentCamera = await renderer3d.getCameraPosition();
        const savedState = await renderer3d.getSavedCameraState(
          basicDatasetName
        );

        if (!savedState) {
          return false;
        }

        return positionsAreClose(
          savedState.position as [number, number, number],
          currentCamera,
          1.0
        );
      })
      .toBe(true);

    const newPosition = await renderer3d.getCameraPosition();
    const savedState = await renderer3d.getSavedCameraState(basicDatasetName);
    expect(savedState).not.toBeNull();

    // Camera should have moved from its initial position.
    expect(
      positionsAreClose(newPosition, initialPosition),
      `Expected camera to have moved from ${initialPosition}, but it's still at ${newPosition}`
    ).toBe(false);

    expect(
      positionsAreClose(
        savedState!.position as [number, number, number],
        newPosition,
        1.0
      ),
      `Expected localStorage to have ${newPosition}, but got ${
        savedState!.position
      }`
    ).toBe(true);
  });
});
