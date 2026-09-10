/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Foundational coverage for the 3D (looker-3d) polyline annotation surface — the
 * second 3D annotation archetype after cuboids, and previously uncovered. Opens
 * an `.fo3d` scene carrying a seeded `Polyline` (a `points3d` list of
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
import { Browser, expect, test as base } from "src/oss/fixtures";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";
import { EventUtils } from "src/shared/event-utils";
import type { AbstractFiftyoneLoader } from "src/shared/abstract-loader";
import { annotate3dSeed } from "./annotate-3d/seed";

const datasetName = getUniqueDatasetNameWithPrefix("annotate-3d-polyline");

/** Fixed ObjectId addressing the first sample (so we can deep-link the modal). */
const id = "000000000000000000000000";

const polylineClasses = ["lane", "barrier", "curb"];

const test = base.extend<{ modal: ModalPom }>({
  modal: async ({ page, eventUtils }, use) => {
    await use(new ModalPom(page, eventUtils));
  },
});

test.beforeAll(async ({ foWebServer }) => {
  await foWebServer.startWebServer();
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

/** Verify persisted state from a brand-new browser context (true round-trip). */
const inFreshContext = async (
  browser: Browser,
  fiftyoneLoader: AbstractFiftyoneLoader,
  verify: (modal: ModalPom) => Promise<void>,
) => {
  const context = await browser.newContext();
  const freshPage = await context.newPage();
  try {
    const freshModal = new ModalPom(freshPage, new EventUtils(freshPage));
    await openAnnotate(fiftyoneLoader, freshModal, freshPage);
    await verify(freshModal);
  } finally {
    await context.close();
  }
};

/** The labels listed in the annotate sidebar of a fresh browser context. */
const expectPersistedLabels = (
  browser: Browser,
  fiftyoneLoader: AbstractFiftyoneLoader,
  labels: string[],
) =>
  inFreshContext(browser, fiftyoneLoader, async (fresh) => {
    await fresh.annotate3d.assert.labelCount(labels.length);
    for (const label of labels) {
      await fresh.annotate3d.assert.labelListed(label);
    }
  });

test.describe.serial("3d polyline annotation", () => {
  // Re-seed per test so each delete/undo case starts from a clean polyline
  // (mirrors the cuboid spec).
  test.beforeEach(async ({ datasetFactory, fiftyoneLoader, modal, page }) => {
    await datasetFactory.create3dDataset({
      datasetName,
      ...annotate3dSeed({
        // polyline-only active schema (no cuboids requested)
        cuboidSampleIndices: [],
        polylineClasses,
        polylineSampleIndices: [0],
      }),
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
    browser,
    fiftyoneLoader,
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
    await expectPersistedLabels(browser, fiftyoneLoader, ["barrier"]);
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
    browser,
    fiftyoneLoader,
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

    await expectPersistedLabels(browser, fiftyoneLoader, []);
  });

  // The audit flagged that undo/redo durability across an autosave is
  // unverified on every surface. Once a class edit has been persisted, the
  // engine's command stack must still drive undo AND redo — and each step must
  // itself re-persist (the engine commits through the same save path).
  test("undo and redo of a persisted class edit re-persist through the DB", async ({
    browser,
    fiftyoneLoader,
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
    await expectPersistedLabels(browser, fiftyoneLoader, ["barrier"]);

    // after the autosave the stack survives: undo reverts the class and
    // re-persists "lane"
    saved = awaitSave();
    await modal.sidebar.edit.assert.undoIsEnabled(true);
    await modal.sidebar.edit.undo();
    await modal.sidebar.edit.assert.verifyFieldValue("label", "lane");
    await saved;
    await expectPersistedLabels(browser, fiftyoneLoader, ["lane"]);

    // redo re-applies the class and re-persists "barrier"
    saved = awaitSave();
    await modal.sidebar.edit.assert.redoIsEnabled(true);
    await modal.sidebar.edit.redo();
    await modal.sidebar.edit.assert.verifyFieldValue("label", "barrier");
    await saved;
    await expectPersistedLabels(browser, fiftyoneLoader, ["barrier"]);
  });
});

// Canvas polyline CREATE — kept in its own describe seeded with an EMPTY scene
// (no pre-seeded polyline). The draw raycasts onto the z=0 plane via the
// empty-canvas pointer handler; a pre-seeded label at scene center can intercept
// a draw click, so a clean scene makes the gesture deterministic.
test.describe.serial("3d polyline creation", () => {
  test.beforeEach(async ({ datasetFactory, fiftyoneLoader, modal, page }) => {
    await datasetFactory.create3dDataset({
      datasetName,
      ...annotate3dSeed({
        cuboidSampleIndices: [],
        polylineClasses,
        polylineSampleIndices: [],
      }),
    });
    await openAnnotate(fiftyoneLoader, modal, page);
  });

  test("drawing a polyline on the canvas creates a label, assigns a class, and persists", async ({
    browser,
    fiftyoneLoader,
    modal,
    page,
  }) => {
    // enter polyline mode (arms the toolbar + active polyline field), look
    // straight down the Z axis so the clicks land deterministically on the z=0
    // plane, then arm a new segment
    await modal.annotate3d.enterPolylineMode();
    await modal.annotate3d.assert.polylineModeActive(true);
    await modal.looker3dControls.setTopView();

    // the freshly-created polyline auto-selects, opening its edit form
    const labelInput = modal.sidebar.edit
      .getFieldContainer("label")
      .locator("input, textarea, select");
    if (!(await modal.annotate3d.isNewSegmentActive())) {
      await modal.annotate3d.startSegment();
    }
    await modal.annotate3d.drawPolyline([
      [0.4, 0.4],
      [0.6, 0.4],
      [0.6, 0.6],
    ]);
    await expect(labelInput).toBeVisible();

    // the freshly-drawn polyline is auto-selected with its edit form open
    // (which replaces the label list); verify creation through the form, then
    // assign a distinct class and let it autosave
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
    await inFreshContext(browser, fiftyoneLoader, async (fresh) => {
      await fresh.annotate3d.assert.labelCount(1);
      await fresh.annotate3d.assert.labelListed("barrier");
      await fresh.annotate3d.selectLabel("barrier");
      expect(
        await fresh.annotate3d.selectedVertexCount(),
      ).toBeGreaterThanOrEqual(2);
    });
  });
});
