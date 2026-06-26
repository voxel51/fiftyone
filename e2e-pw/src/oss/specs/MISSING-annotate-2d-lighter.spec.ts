/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * 2D Lighter annotation surface: drawing, editing, deleting, undo/redo, and
 * persistence of detection labels through the annotation engine. Asserts on the
 * engine-derived sidebar list + edit form (not screenshots) so the checks pin
 * behavior rather than pixels.
 */
import { expect, test as base } from "src/oss/fixtures";
import { ModalPom } from "src/oss/poms/modal";
import { SampleCanvasType } from "src/oss/poms/modal/sample-canvas";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";
import { EventUtils } from "src/shared/event-utils";

const datasetName = getUniqueDatasetNameWithPrefix("annotate-2d-lighter");

/** Fixed ObjectId addressing the single sample (so we can deep-link the modal). */
const id = "000000000000000000000000";

const test = base.extend<{ modal: ModalPom }>({
  modal: async ({ page, eventUtils }, use) => {
    await use(new ModalPom(page, eventUtils));
  },
});

test.beforeAll(async ({ annotateSDK, datasetFactory, foWebServer }) => {
  await foWebServer.startWebServer();
  await datasetFactory.createDataset({
    datasetName,
    imageOptions: { fillColor: "white", width: 640, height: 480 },
    schema: { detections: "Detections" },
    withSampleData: (_, { createId }) => ({
      detections: {
        detections: [
          { _id: createId(), label: "cat", bounding_box: [0.4, 0.4, 0.2, 0.2] },
        ],
      },
    }),
  });

  await annotateSDK.updateLabelSchema(datasetName, "detections", {
    type: "detections",
    classes: ["cat", "dog"],
    attributes: [],
    component: "dropdown",
  });
  await annotateSDK.addFieldToActiveLabelSchema(datasetName, "detections");
});

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test.beforeEach(async ({ fiftyoneLoader, modal, page }) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
    searchParams: new URLSearchParams({ id }),
  });
  await modal.waitForSampleLoadDomAttribute();
  await modal.assert.isOpen();
  await modal.sidebar.switchMode("annotate");
});

/** Poll the engine-derived Labels count until it settles on `expected`. */
const expectLabelsCount = async (modal: ModalPom, expected: number) => {
  await expect
    .poll(() => modal.sidebar.annotate.getActiveLabelsCount())
    .toBe(expected);
};

/** Draw a detection box across the given relative corners (annotate mode). */
const drawBox = async (
  modal: ModalPom,
  from: [number, number],
  to: [number, number],
) => {
  await modal.sidebar.annotate.detectionMode("Detections");
  await modal.sampleCanvas.move(from[0], from[1], "crosshair");
  await modal.sampleCanvas.down();
  await modal.sampleCanvas.move(to[0], to[1]);
  await modal.sampleCanvas.up();
};

test.describe.serial("2D Lighter annotation", () => {
  // NOTE: serial tests share one dataset and autosaved draws PERSIST across
  // tests, so assertions are RELATIVE to the count observed at test start.
  test("a drawn detection appears in the engine-derived sidebar list", async ({
    modal,
  }) => {
    await modal.sampleCanvas.assert.is(SampleCanvasType.LIGHTER);
    const before = await modal.sidebar.annotate.getActiveLabelsCount();

    await drawBox(modal, [0.7, 0.7], [0.88, 0.88]);

    // drawing auto-opens the edit form (form follows the anchor); exit to the
    // list so we can read the engine-derived Labels count
    await modal.sidebar.edit.exitToList();

    // the declarative list reconciles in the new row (no Lighter→sidebar write)
    await expectLabelsCount(modal, before + 1);
  });

  test("deleting a detection drops its row; undo restores it", async ({
    modal,
    page,
  }) => {
    const before = await modal.sidebar.annotate.getActiveLabelsCount();

    await modal.sidebar.annotate.selectActiveLabel("cat", 0);
    await page.keyboard.press("Backspace");
    await expectLabelsCount(modal, before - 1);

    await modal.sidebar.edit.undo();
    await expectLabelsCount(modal, before);
  });

  test("a drawn detection persists (verified from a fresh browser context)", async ({
    browser,
    fiftyoneLoader,
    modal,
    page,
  }) => {
    const before = await modal.sidebar.annotate.getActiveLabelsCount();

    // the new box autosaves via POST/PATCH dataset/.../sample/...; await it so
    // the verification can't race the persist
    const saved = page.waitForResponse(
      (r) =>
        /\/sample\//.test(r.url()) &&
        ["POST", "PATCH", "PUT"].includes(r.request().method()),
    );
    await drawBox(modal, [0.1, 0.1], [0.28, 0.28]);
    await modal.sidebar.edit.exitToList();
    await expectLabelsCount(modal, before + 1);
    await saved;

    // verify from a BRAND-NEW context (no shared client cache) — proves the box
    // round-tripped to the server, and exercises load-time bridge hydration on a
    // clean load. (A mid-test page.reload() can't be used: the app uses relative
    // asset paths, so reloading a nested /datasets/... URL 404s its bundle.)
    const context = await browser.newContext();
    const freshPage = await context.newPage();

    try {
      await fiftyoneLoader.waitUntilGridVisible(freshPage, datasetName, {
        searchParams: new URLSearchParams({ id }),
      });
      const freshModal = new ModalPom(freshPage, new EventUtils(freshPage));
      await freshModal.waitForSampleLoadDomAttribute();
      await freshModal.sidebar.switchMode("annotate");

      await expectLabelsCount(freshModal, before + 1);
    } finally {
      await context.close();
    }
  });
});
