/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Foundational coverage for the 3D (looker-3d) polyline annotation surface — the
 * second 3D annotation archetype after cuboids, and previously uncovered. Opens
 * an `.fo3d` scene carrying a seeded `fo.Polyline` (a `points3d` list of
 * `[x,y,z]` segments) in annotate mode and exercises the deterministic flows:
 * the polyline lists in the sidebar and is selectable, selecting it opens the
 * edit form + the (translate-only) transform gizmo, a class edit persists, and a
 * delete round-trips through undo/redo and persists.
 *
 * Geometry editing on a polyline happens through 3D vertex markers / segment
 * clicks (raycast handles with no DOM selectors), so unlike the cuboid spec
 * there's no deterministic form-driven geometry edit — class edits and the
 * canvas draw are the deterministic surfaces and are what this covers.
 */
import { expect, test as base } from "src/oss/fixtures";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";
import type { AbstractFiftyoneLoader } from "src/shared/abstract-loader";

const datasetName = getUniqueDatasetNameWithPrefix("annotate-3d-polyline");

/** Fixed ObjectId addressing the first sample (so we can deep-link the modal). */
const id = "000000000000000000000000";
const plyPath = `/tmp/${datasetName}.ply`;
const scenePath = `/tmp/${datasetName}.fo3d`;

const polylineClasses = ["lane", "barrier", "curb"];

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
  page: import("src/oss/fixtures").Page,
) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
    searchParams: new URLSearchParams({ id }),
  });
  await modal.assert.isOpen();
  await modal.sidebar.switchMode("annotate");
  await modal.annotate3d.waitForSurface();
};

test.describe.serial("3d polyline annotation", () => {
  // Re-seed per test so each delete/undo case starts from a clean polyline
  // (mirrors the cuboid spec).
  test.beforeEach(async ({ annotate3dSDK, fiftyoneLoader, modal, page }) => {
    await annotate3dSDK.seed({
      datasetName,
      scenePaths: [scenePath],
      // polyline-only active schema (no cuboids requested)
      cuboidSampleIndices: [],
      polylineClasses,
      polylineSampleIndices: [0],
    });
    await openAnnotate(fiftyoneLoader, modal, page);
  });

  test("the seeded polyline is listed in the annotate sidebar", async ({
    modal,
  }) => {
    await modal.annotate3d.assert.labelCount(1);
    await modal.annotate3d.assert.labelListed("lane");
  });

  test("selecting the polyline opens its edit form, toolbar, and transform gizmo", async ({
    modal,
  }) => {
    await modal.annotate3d.selectLabel("lane");

    // the edit form binds to the selected polyline's class
    await modal.sidebar.edit.assert.verifyFieldValue("label", "lane");

    // selecting a polyline arms its annotation mode, which mounts the toolbar +
    // transform group; polylines support translate only (rotate/scale are
    // cuboid/plane gizmos), and translate is the default mode
    await modal.annotate3d.assert.toolbarVisible();
    await modal.annotate3d.assert.transformModeActive("translate");
  });

  test("a class edit on the polyline persists across a fresh save", async ({
    annotate3dSDK,
    modal,
    page,
  }) => {
    await modal.annotate3d.selectLabel("lane");

    const saved = page.waitForResponse(
      (r) =>
        /\/sample\//.test(r.url()) &&
        ["POST", "PATCH", "PUT"].includes(r.request().method()),
    );
    await modal.sidebar.edit.selectFieldChoice("label", "barrier");
    await modal.sidebar.edit.assert.verifyFieldValue("label", "barrier");
    await saved;

    // the polyline stays a single label whose class is now persisted "barrier"
    await expect
      .poll(async () => annotate3dSDK.getPolylineLabels(datasetName), {
        // each readback spawns a python process, so give the DB round-trip
        // room for several attempts (the default 5s is too tight).
        timeout: 20_000,
      })
      .toEqual(["barrier"]);
  });

  test("deleting the polyline drops its row; undo restores it and redo re-deletes", async ({
    modal,
  }) => {
    await modal.annotate3d.selectLabel("lane");
    await modal.annotate3d.deleteSelected();
    await modal.annotate3d.assert.labelCount(0);

    // undo restores the deleted polyline
    await modal.sidebar.edit.undo();
    await modal.annotate3d.assert.labelListed("lane");
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
    await modal.annotate3d.selectLabel("lane");

    const saved = page.waitForResponse(
      (r) =>
        /\/sample\//.test(r.url()) &&
        ["POST", "PATCH", "PUT"].includes(r.request().method()),
    );
    await modal.annotate3d.deleteSelected();
    await modal.annotate3d.assert.labelCount(0);
    await saved;

    await expect
      .poll(async () => annotate3dSDK.getPolylineLabels(datasetName), {
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
          ["POST", "PATCH", "PUT"].includes(r.request().method()),
      );

    await modal.annotate3d.selectLabel("lane");

    // edit class lane -> barrier and let it autosave
    let saved = awaitSave();
    await modal.sidebar.edit.selectFieldChoice("label", "barrier");
    await saved;
    await expect
      .poll(async () => annotate3dSDK.getPolylineLabels(datasetName), {
        timeout: 20_000,
      })
      .toEqual(["barrier"]);

    // after the autosave the stack survives: undo reverts the class and
    // re-persists "lane"
    saved = awaitSave();
    await modal.sidebar.edit.assert.undoIsEnabled(true);
    await modal.sidebar.edit.undo();
    await modal.sidebar.edit.assert.verifyFieldValue("label", "lane");
    await saved;
    await expect
      .poll(async () => annotate3dSDK.getPolylineLabels(datasetName), {
        timeout: 20_000,
      })
      .toEqual(["lane"]);

    // redo re-applies the class and re-persists "barrier"
    saved = awaitSave();
    await modal.sidebar.edit.assert.redoIsEnabled(true);
    await modal.sidebar.edit.redo();
    await modal.sidebar.edit.assert.verifyFieldValue("label", "barrier");
    await saved;
    await expect
      .poll(async () => annotate3dSDK.getPolylineLabels(datasetName), {
        timeout: 20_000,
      })
      .toEqual(["barrier"]);
  });
});

// Canvas polyline CREATE — kept in its own describe seeded with an EMPTY scene
// (no pre-seeded polyline). The draw raycasts onto the z=0 plane via the
// empty-canvas pointer handler; a pre-seeded label at scene center can intercept
// a draw click, so a clean scene makes the gesture deterministic.
test.describe.serial("3d polyline creation", () => {
  test.beforeEach(async ({ annotate3dSDK, fiftyoneLoader, modal, page }) => {
    await annotate3dSDK.seed({
      datasetName,
      scenePaths: [scenePath],
      cuboidSampleIndices: [],
      polylineClasses,
      polylineSampleIndices: [],
    });
    await openAnnotate(fiftyoneLoader, modal, page);
  });

  test("drawing a polyline on the canvas creates a label, assigns a class, and persists", async ({
    annotate3dSDK,
    modal,
    page,
  }) => {
    // enter polyline mode (arms the toolbar + active polyline field), look
    // straight down the Z axis so the clicks land deterministically on the z=0
    // plane, then arm a new segment
    await modal.annotate3d.enterPolylineMode();
    await modal.annotate3d.assert.polylineModeActive(true);
    await modal.looker3dControls.setTopView();
    // let the top-view camera animation settle before drawing — the draw clicks
    // raycast against the live camera, so a still-animating (perspective) camera
    // can drop vertices and leave the polyline uncommitted under slower CI
    // rendering
    // eslint-disable-next-line playwright/no-wait-for-timeout
    await page.waitForTimeout(1000);
    await modal.annotate3d.startSegment();
    await modal.annotate3d.assert.newSegmentActive(true);

    // place three vertices, then double-click to commit
    await modal.annotate3d.drawPolyline([
      [0.4, 0.4],
      [0.6, 0.4],
      [0.6, 0.6],
    ]);

    // the freshly-drawn polyline is auto-selected with its edit form open
    // (which replaces the label list), so verify creation through the form,
    // then assign a distinct class and let it autosave
    await modal.sidebar.edit.assert.verifyFieldValue("label", "lane");
    const saved = page.waitForResponse(
      (r) =>
        /\/sample\//.test(r.url()) &&
        ["POST", "PATCH", "PUT"].includes(r.request().method()),
    );
    await modal.sidebar.edit.selectFieldChoice("label", "barrier");
    await modal.sidebar.edit.assert.verifyFieldValue("label", "barrier");
    await saved;

    // the drawn polyline persists as a single label carrying the class and a
    // non-empty points3d geometry
    await expect
      .poll(async () => annotate3dSDK.getPolylineLabels(datasetName), {
        timeout: 20_000,
      })
      .toEqual(["barrier"]);

    const geom = await annotate3dSDK.getPolylineGeometry(datasetName);
    expect(geom.points3d?.length ?? 0).toBeGreaterThan(0);
    expect(geom.points3d?.[0]?.length ?? 0).toBeGreaterThanOrEqual(2);
  });
});
