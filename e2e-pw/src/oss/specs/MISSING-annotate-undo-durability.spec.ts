/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Undo-stack durability regressions in annotate mode:
 *  - the engine undo stack SURVIVES an autosave (a persist echo emits a
 *    whole-sample reset; it must not wipe undo history), and
 *  - a select-only canvas click records NO phantom undo entry (a select fires
 *    overlay-drag-end → commit; a value-equal commit must not capture an op).
 *
 * Both were real defects fixed in the engine (`engine.ts`: drop undos.clear() on
 * whole-sample reset; skip value-equal ops in captureOps). Only an e2e exercises
 * the real autosave round-trip, so these complement the engine unit tests.
 */
import { expect, test as base } from "src/oss/fixtures";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix("annotate-undo-durability");

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

/** Read a numeric edit-form field value. */
const fieldNum = async (modal: ModalPom, path: string) =>
  Number(await modal.sidebar.edit.getFieldValue(path));

test.describe.serial("annotate undo durability", () => {
  // NOTE: the phantom-undo test runs FIRST — it clicks the seeded box at its
  // canvas center, so it needs the box at its pristine [0.4,0.4,0.2,0.2] bounds.
  // The autosave test persists a moved geometry, so it must come AFTER.
  test("a select-only canvas click records no phantom undo entry", async ({
    modal,
  }) => {
    // a fresh modal (beforeEach reloads) starts with an empty undo stack
    await modal.sidebar.edit.assert.undoIsEnabled(false);

    // click the existing detection on the canvas to SELECT it (no edit). This
    // fires overlay-drag-end → commit with a value-equal bounding_box; the engine
    // must skip the no-op op rather than capture a phantom entry. The "pointer"
    // cursor wait ensures the overlay is HOVERED before the click — lighter
    // selects the hovered overlay, so a click without a registered hover selects
    // nothing (matches the canvas-actions spec's overlay-select pattern).
    await modal.sampleCanvas.move(0.5, 0.5, "pointer");
    await modal.sampleCanvas.down();
    await modal.sampleCanvas.up();

    // confirm the click selected the box (the edit form opened)
    await expect(modal.sidebar.edit.backButton).toBeVisible();

    // selected but nothing edited → the select-click recorded no phantom entry
    await modal.sidebar.edit.assert.undoIsEnabled(false);
  });

  test("the undo stack survives an autosave", async ({ modal, page }) => {
    await modal.sidebar.annotate.selectActiveLabel("cat", 0);
    const before = await fieldNum(modal, "position.x");

    // edit a field; the engine commits + autosaves (PATCH dataset/.../sample/...)
    const saved = page.waitForResponse(
      (r) =>
        /\/sample\//.test(r.url()) &&
        ["POST", "PATCH", "PUT"].includes(r.request().method())
    );
    await modal.sidebar.edit.setFieldValue("position.x", "0.123");
    await expect
      .poll(() => fieldNum(modal, "position.x"))
      .toBeCloseTo(0.123, 4);
    await modal.sidebar.edit.assert.undoIsEnabled();
    await saved;

    // the persist echo (whole-sample reset) must NOT have wiped the stack:
    // undo is still enabled and still reverts the edit
    await modal.sidebar.edit.assert.undoIsEnabled();
    await modal.sidebar.edit.undo();
    await expect
      .poll(() => fieldNum(modal, "position.x"))
      .toBeCloseTo(before, 4);
  });
});
