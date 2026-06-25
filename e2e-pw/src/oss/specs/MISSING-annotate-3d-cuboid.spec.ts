/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Foundational coverage for the 3D (looker-3d) annotation surface — the engine
 * surface that previously had NO e2e coverage. Opens an `.fo3d` scene carrying
 * a seeded cuboid (`fo.Detection` with location/dimensions/rotation) in
 * annotate mode and exercises the deterministic flows: the annotation toolbar
 * mounts, the cuboid lists in the sidebar and is selectable, selecting it opens
 * the edit form + transform gizmo, and deleting it round-trips through undo and
 * persists.
 *
 * The three-click canvas cuboid-DRAW gesture raycasts into the three.js scene
 * (camera/scene-dependent, non-deterministic in world space) and is left to a
 * follow-up spec; this harness establishes select/edit/delete/undo/persist on a
 * seeded cuboid.
 */
import { expect, test as base } from "src/oss/fixtures";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";
import type { AbstractFiftyoneLoader } from "src/shared/abstract-loader";

const datasetName = getUniqueDatasetNameWithPrefix("annotate-3d-cuboid");

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
  // a single PLY cube wrapped in a minimal fo3d scene is enough geometry for
  // the viewer to mount and frame the scene.
  mediaFactory.createPly({ outputPath: plyPath, shape: "cube" });
  mediaFactory.createFo3d({ outputPath: scenePath, plyPath });
});

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

/** Open the modal in annotate mode on the deep-linked 3D sample. */
const openAnnotate = async (
  fiftyoneLoader: AbstractFiftyoneLoader,
  modal: ModalPom,
  page: import("src/oss/fixtures").Page
) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
    searchParams: new URLSearchParams({ id }),
  });
  await modal.assert.isOpen();
  await modal.sidebar.switchMode("annotate");
  await modal.annotate3d.waitForSurface();
};

test.describe.serial("3d cuboid annotation", () => {
  // Re-seed per test so each delete/undo case starts from a clean cuboid
  // (mirrors the video label-create specs).
  test.beforeEach(async ({ annotate3dSDK, fiftyoneLoader, modal, page }) => {
    await annotate3dSDK.seed({
      datasetName,
      scenePaths: [scenePath],
      classes: ["car", "truck", "pedestrian"],
      cuboidSampleIndices: [0],
    });
    await openAnnotate(fiftyoneLoader, modal, page);
  });

  test("the seeded cuboid is listed in the annotate sidebar", async ({
    modal,
  }) => {
    await modal.annotate3d.assert.labelCount(1);
    await modal.annotate3d.assert.labelListed("car");
  });

  test("selecting the cuboid opens its edit form, toolbar, and transform gizmo", async ({
    modal,
  }) => {
    await modal.annotate3d.selectLabel("car");

    // the edit form binds to the selected cuboid's class
    await modal.sidebar.edit.assert.verifyFieldValue("label", "car");

    // selecting a cuboid arms its annotation mode, which mounts the toolbar +
    // transform group; translate is the default gizmo mode
    await modal.annotate3d.assert.toolbarVisible();
    await modal.annotate3d.assert.transformModeActive("translate");
  });

  test("editing a cuboid's position via the form persists and round-trips through undo/redo", async ({
    annotate3dSDK,
    modal,
    page,
  }) => {
    await modal.annotate3d.selectLabel("car");

    // seeded geometry: location [0, 0, 0]
    await expect(modal.annotate3d.geometryField("x")).toHaveValue("0.00");

    // editing the x input commits an undoable engine write that autosaves
    const saved = page.waitForResponse(
      (r) =>
        /\/sample\//.test(r.url()) &&
        ["POST", "PATCH", "PUT"].includes(r.request().method())
    );
    await modal.annotate3d.setGeometry("x", "1.5");
    await saved;

    // the new x persists (form edits store the value verbatim — no
    // container/world coordinate ambiguity)
    await expect
      .poll(
        async () => {
          const geom = await annotate3dSDK.getCuboidGeometry(datasetName);
          return geom.location
            ? Math.round(geom.location[0] * 100) / 100
            : null;
        },
        { timeout: 20_000 }
      )
      .toBe(1.5);

    // the form value mirrors the committed engine state, so undo/redo of the
    // geometry edit round-trips there
    await modal.sidebar.edit.undo();
    await expect(modal.annotate3d.geometryField("x")).toHaveValue("0.00");
    await modal.sidebar.edit.redo();
    await expect(modal.annotate3d.geometryField("x")).toHaveValue("1.50");
  });

  test("a class edit on the cuboid persists across a fresh save", async ({
    annotate3dSDK,
    modal,
    page,
  }) => {
    await modal.annotate3d.selectLabel("car");

    const saved = page.waitForResponse(
      (r) =>
        /\/sample\//.test(r.url()) &&
        ["POST", "PATCH", "PUT"].includes(r.request().method())
    );
    await modal.sidebar.edit.selectFieldChoice("label", "truck");
    await modal.sidebar.edit.assert.verifyFieldValue("label", "truck");
    await saved;

    // the cuboid stays a single detection whose class is now persisted "truck"
    await expect
      .poll(async () => annotate3dSDK.getCuboidLabels(datasetName), {
        // each readback spawns a python process, so give the DB round-trip
        // room for several attempts (the default 5s is too tight).
        timeout: 20_000,
      })
      .toEqual(["truck"]);
  });

  test("deleting the cuboid drops its row; undo restores it and redo re-deletes", async ({
    modal,
  }) => {
    await modal.annotate3d.selectLabel("car");
    await modal.annotate3d.deleteSelected();
    await modal.annotate3d.assert.labelCount(0);

    // undo restores the deleted cuboid
    await modal.sidebar.edit.undo();
    await modal.annotate3d.assert.labelListed("car");
    await modal.annotate3d.assert.labelCount(1);

    // redo re-applies the delete
    await modal.sidebar.edit.assert.redoIsEnabled(true);
    await modal.sidebar.edit.redo();
    await modal.annotate3d.assert.labelCount(0);
  });

  test("a delete persists across a fresh save", async ({
    annotate3dSDK,
    modal,
    page,
  }) => {
    await modal.annotate3d.selectLabel("car");

    const saved = page.waitForResponse(
      (r) =>
        /\/sample\//.test(r.url()) &&
        ["POST", "PATCH", "PUT"].includes(r.request().method())
    );
    await modal.annotate3d.deleteSelected();
    await modal.annotate3d.assert.labelCount(0);
    await saved;

    await expect
      .poll(async () => annotate3dSDK.getCuboidLabels(datasetName), {
        // each readback spawns a python process, so give the DB round-trip
        // room for several attempts (the default 5s is too tight).
        timeout: 20_000,
      })
      .toEqual([]);
  });

  // The audit flagged that undo/redo durability across an autosave is
  // unverified on every surface. Once a class edit has been persisted, the
  // engine's command stack must still drive undo AND redo — and each step must
  // itself re-persist (the engine commits through the same save path).
  test("undo and redo of a persisted class edit re-persist through the DB", async ({
    annotate3dSDK,
    modal,
    page,
  }) => {
    const awaitSave = () =>
      page.waitForResponse(
        (r) =>
          /\/sample\//.test(r.url()) &&
          ["POST", "PATCH", "PUT"].includes(r.request().method())
      );

    await modal.annotate3d.selectLabel("car");

    // edit class car -> truck and let it autosave
    let saved = awaitSave();
    await modal.sidebar.edit.selectFieldChoice("label", "truck");
    await saved;
    await expect
      .poll(async () => annotate3dSDK.getCuboidLabels(datasetName), {
        // each readback spawns a python process, so give the DB round-trip
        // room for several attempts (the default 5s is too tight).
        timeout: 20_000,
      })
      .toEqual(["truck"]);

    // after the autosave the stack survives: undo reverts the class and
    // re-persists "car"
    saved = awaitSave();
    await modal.sidebar.edit.assert.undoIsEnabled(true);
    await modal.sidebar.edit.undo();
    await modal.sidebar.edit.assert.verifyFieldValue("label", "car");
    await saved;
    await expect
      .poll(async () => annotate3dSDK.getCuboidLabels(datasetName), {
        // each readback spawns a python process, so give the DB round-trip
        // room for several attempts (the default 5s is too tight).
        timeout: 20_000,
      })
      .toEqual(["car"]);

    // redo re-applies the class and re-persists "truck"
    saved = awaitSave();
    await modal.sidebar.edit.assert.redoIsEnabled(true);
    await modal.sidebar.edit.redo();
    await modal.sidebar.edit.assert.verifyFieldValue("label", "truck");
    await saved;
    await expect
      .poll(async () => annotate3dSDK.getCuboidLabels(datasetName), {
        // each readback spawns a python process, so give the DB round-trip
        // room for several attempts (the default 5s is too tight).
        timeout: 20_000,
      })
      .toEqual(["truck"]);
  });
});

// Canvas cuboid CREATE — kept in its own describe seeded with an EMPTY scene.
// The three-click draw raycasts onto the z=0 plane via the empty-canvas pointer
// handler; a pre-seeded cuboid sitting at scene center can intercept a draw
// click (selecting it instead of drawing), so a clean scene makes the gesture
// deterministic.
test.describe.serial("3d cuboid creation", () => {
  test.beforeEach(async ({ annotate3dSDK, fiftyoneLoader, modal, page }) => {
    await annotate3dSDK.seed({
      datasetName,
      scenePaths: [scenePath],
      classes: ["car", "truck", "pedestrian"],
      cuboidSampleIndices: [],
    });
    await openAnnotate(fiftyoneLoader, modal, page);
  });

  test("drawing a cuboid on the canvas creates a label, assigns a class, and persists", async ({
    annotate3dSDK,
    modal,
    page,
  }) => {
    // enter cuboid mode (arms the toolbar + active field), look straight down
    // the Z axis so the three clicks land deterministically on the z=0 plane
    await modal.annotate3d.enterCuboidMode();
    await modal.looker3dControls.setTopView();
    await modal.annotate3d.toggleCreateCuboid();
    await modal.annotate3d.assert.createCuboidActive(true);

    // center -> orientation -> width
    await modal.annotate3d.drawCuboid([
      [0.4, 0.4],
      [0.6, 0.4],
      [0.6, 0.6],
    ]);

    // the freshly-drawn cuboid is auto-selected with its edit form open (which
    // replaces the label list), so verify creation through the form, then
    // assign a distinct class and let it autosave
    await modal.sidebar.edit.assert.verifyFieldValue("label", "car");
    const saved = page.waitForResponse(
      (r) =>
        /\/sample\//.test(r.url()) &&
        ["POST", "PATCH", "PUT"].includes(r.request().method())
    );
    await modal.sidebar.edit.selectFieldChoice("label", "truck");
    await modal.sidebar.edit.assert.verifyFieldValue("label", "truck");
    await saved;

    // the drawn cuboid persists as a single detection carrying the class
    await expect
      .poll(async () => annotate3dSDK.getCuboidLabels(datasetName), {
        timeout: 20_000,
      })
      .toEqual(["truck"]);
  });
});
