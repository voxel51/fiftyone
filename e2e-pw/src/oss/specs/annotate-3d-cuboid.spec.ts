/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * 3D (looker-3d) cuboid annotation on a seeded `Detection` with
 * location/dimensions/rotation: the toolbar mounts, the cuboid lists and
 * selects, its form edits persist, and delete round-trips through undo. The
 * three-click canvas draw is covered in its own describe on an empty scene.
 */
import { Browser, expect, test as base } from "src/oss/fixtures";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";
import { EventUtils } from "src/shared/event-utils";
import type { AbstractFiftyoneLoader } from "src/shared/abstract-loader";

const datasetName = getUniqueDatasetNameWithPrefix("annotate-3d-cuboid");

/** Fixed ObjectId addressing the first sample (so we can deep-link the modal). */
const id = "000000000000000000000000";

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

test.describe.serial("3d cuboid annotation", () => {
  // Re-seed per test so each delete/undo case starts from a clean cuboid
  // (mirrors the video label-create specs).
  test.beforeEach(async ({ datasetFactory, fiftyoneLoader, modal, page }) => {
    await datasetFactory.createDataset({
      mediaType: "3d",
      datasetName,
      schema: {
        detections: "Detections",
        "detections.detections.location": "ListField<FloatField>",
        "detections.detections.dimensions": "ListField<FloatField>",
        "detections.detections.rotation": "ListField<FloatField>",
      },
      labelSchemas: {
        detections: {
          type: "detections",
          component: "dropdown",
          classes: ["car", "truck", "pedestrian"],
          attributes: [
            { name: "id", type: "id", component: "text", read_only: true },
            { name: "tags", type: "list<str>", component: "text" },
          ],
        },
      },
      // one seeded cuboid at the origin; the grid looker reads the declared
      // bounding_box list even on a 3D detection
      withSampleData: (_, { label }) => ({
        detections: label.detections([
          label.detection({
            label: "car",
            bounding_box: [],
            location: [0, 0, 0],
            dimensions: [2, 2, 2],
            rotation: [0, 0, 0],
          }),
        ]),
      }),
    });
    await openAnnotate(fiftyoneLoader, modal, page);
  });

  test("the seeded cuboid is listed in the annotate sidebar", async ({
    modal,
  }) => {
    await modal.annotate3d.assert.labelCount(1);
    await modal.annotate3d.assert.labelListed("car");
  });

  test("selecting the cuboid opens its edit form, toolbar, and scale gizmo", async ({
    modal,
  }) => {
    await modal.annotate3d.selectLabel("car");

    // the edit form binds to the selected cuboid's class
    await modal.sidebar.edit.assert.verifyFieldValue("label", "car");

    // selecting a cuboid arms its annotation mode, which mounts the toolbar +
    // transform group; translate is the default gizmo mode
    await modal.annotate3d.assert.toolbarVisible();
    await modal.annotate3d.assert.transformModeActive("scale");
  });

  test("editing a cuboid's position via the form persists and round-trips through undo/redo", async ({
    browser,
    fiftyoneLoader,
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
        ["POST", "PATCH", "PUT"].includes(r.request().method()),
    );
    await modal.annotate3d.setGeometry("x", "1.5");
    await saved;

    // the new x persists (form edits store the value verbatim — no
    // container/world coordinate ambiguity)
    await inFreshContext(browser, fiftyoneLoader, async (fresh) => {
      await fresh.annotate3d.selectLabel("car");
      await expect(fresh.annotate3d.geometryField("x")).toHaveValue("1.50");
    });

    // the form value mirrors the committed engine state, so undo/redo of the
    // geometry edit round-trips there
    await modal.sidebar.edit.undo();
    await expect(modal.annotate3d.geometryField("x")).toHaveValue("0.00");
    await modal.sidebar.edit.redo();
    await expect(modal.annotate3d.geometryField("x")).toHaveValue("1.50");
  });

  test("a class edit on the cuboid persists across a fresh save", async ({
    browser,
    fiftyoneLoader,
    modal,
    page,
  }) => {
    await modal.annotate3d.selectLabel("car");

    const saved = page.waitForResponse(
      (r) =>
        /\/sample\//.test(r.url()) &&
        ["POST", "PATCH", "PUT"].includes(r.request().method()),
    );
    await modal.sidebar.edit.selectFieldChoice("label", "truck");
    await modal.sidebar.edit.assert.verifyFieldValue("label", "truck");
    await saved;

    // the cuboid stays a single detection whose class is now persisted "truck"
    await expectPersistedLabels(browser, fiftyoneLoader, ["truck"]);
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
    browser,
    fiftyoneLoader,
    modal,
    page,
  }) => {
    await modal.annotate3d.selectLabel("car");

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

    await modal.annotate3d.selectLabel("car");

    // edit class car -> truck and let it autosave
    let saved = awaitSave();
    await modal.sidebar.edit.selectFieldChoice("label", "truck");
    await saved;
    await expectPersistedLabels(browser, fiftyoneLoader, ["truck"]);

    // after the autosave the stack survives: undo reverts the class and
    // re-persists "car"
    saved = awaitSave();
    await modal.sidebar.edit.assert.undoIsEnabled(true);
    await modal.sidebar.edit.undo();
    await modal.sidebar.edit.assert.verifyFieldValue("label", "car");
    await saved;
    await expectPersistedLabels(browser, fiftyoneLoader, ["car"]);

    // redo re-applies the class and re-persists "truck"
    saved = awaitSave();
    await modal.sidebar.edit.assert.redoIsEnabled(true);
    await modal.sidebar.edit.redo();
    await modal.sidebar.edit.assert.verifyFieldValue("label", "truck");
    await saved;
    await expectPersistedLabels(browser, fiftyoneLoader, ["truck"]);
  });
});

// Canvas cuboid CREATE — kept in its own describe seeded with an EMPTY scene.
// The three-click draw raycasts onto the z=0 plane via the empty-canvas pointer
// handler; a pre-seeded cuboid sitting at scene center can intercept a draw
// click (selecting it instead of drawing), so a clean scene makes the gesture
// deterministic.
test.describe.serial("3d cuboid creation", () => {
  test.beforeEach(async ({ datasetFactory, fiftyoneLoader, modal, page }) => {
    await datasetFactory.createDataset({
      mediaType: "3d",
      datasetName,
      schema: {
        detections: "Detections",
        "detections.detections.location": "ListField<FloatField>",
        "detections.detections.dimensions": "ListField<FloatField>",
        "detections.detections.rotation": "ListField<FloatField>",
      },
      labelSchemas: {
        detections: {
          type: "detections",
          component: "dropdown",
          classes: ["car", "truck", "pedestrian"],
          attributes: [
            { name: "id", type: "id", component: "text", read_only: true },
            { name: "tags", type: "list<str>", component: "text" },
          ],
        },
      },
      withSampleData: (_, { label }) => ({
        detections: label.detections([]),
      }),
    });
    await openAnnotate(fiftyoneLoader, modal, page);
  });

  test("drawing a cuboid on the canvas creates a label, assigns a class, and persists", async ({
    browser,
    fiftyoneLoader,
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
    // the draw's own autosave must land first, or it satisfies the waiter below
    await modal.sidebar.annotate.waitForSavesSettled();
    const saved = page.waitForResponse(
      (r) =>
        /\/sample\//.test(r.url()) &&
        ["POST", "PATCH", "PUT"].includes(r.request().method()),
    );
    await modal.sidebar.edit.selectFieldChoice("label", "truck");
    await modal.sidebar.edit.assert.verifyFieldValue("label", "truck");
    await saved;

    // the drawn cuboid persists as a single detection carrying the class
    await expectPersistedLabels(browser, fiftyoneLoader, ["truck"]);
  });
});
