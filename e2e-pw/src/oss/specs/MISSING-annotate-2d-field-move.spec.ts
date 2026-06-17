/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Moving a 2D label between fields of the same type. The Edit-form field
 * dropdown (`Field.tsx`) commits a single engine `transaction` (delete from the
 * source field + `_id`-preserving upsert at the destination), so a move:
 *   - re-homes the label onto the destination field (one coalesced autosave),
 *   - round-trips through undo/redo on the shared engine stack,
 *   - persists across a true server round-trip.
 *
 * Two same-type Detections fields (`detections`, `predictions`) give the
 * dropdown a destination. Assertions are RELATIVE to the label's current field
 * (read first), so the serial tests don't depend on each other's end state.
 */
import { Browser, expect, test as base } from "src/oss/fixtures";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";
import { EventUtils } from "src/shared/event-utils";
import type { AbstractFiftyoneLoader } from "src/shared/abstract-loader";

const datasetName = getUniqueDatasetNameWithPrefix("annotate-2d-field-move");

/** Fixed ObjectId addressing the single sample (so we can deep-link the modal). */
const id = "000000000000000000000000";

const FIELDS = ["detections", "predictions"] as const;
const otherField = (current: string) =>
  FIELDS.find((f) => f !== current) ?? FIELDS[0];

const isSamplePatch = (method: string) =>
  ["POST", "PATCH", "PUT"].includes(method);

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
    schema: { detections: "Detections", predictions: "Detections" },
    withSampleData: (_, { createId }) => ({
      detections: {
        detections: [
          { _id: createId(), label: "cat", bounding_box: [0.4, 0.4, 0.2, 0.2] },
        ],
      },
    }),
  });

  // Both fields share a schema so the destination dropdown offers the other one.
  for (const field of FIELDS) {
    await annotateSDK.updateLabelSchema(datasetName, field, {
      type: "detections",
      classes: ["cat", "dog"],
      attributes: [],
      component: "dropdown",
    });
    await annotateSDK.addFieldToActiveLabelSchema(datasetName, field);
  }
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

/**
 * Re-select the label and return to a form-open state. A field move (and an
 * undo of one) deletes + re-adds the label under the destination field, which
 * drops the selection anchor and closes the form — so the destination field
 * must be read from a fresh selection, not the stale form.
 */
const reselect = async (modal: ModalPom, label = "cat") => {
  if (await modal.sidebar.edit.backButton.isVisible()) {
    await modal.sidebar.edit.exitToList();
  }
  await modal.sidebar.annotate.selectActiveLabel(label, 0);
};

/**
 * Open the dataset in a fresh browser context (no shared client cache, single
 * clean load — a true server round-trip) and run `verify` against an
 * annotate-mode modal there. See ANNOTATION_E2E_TEST_NOTES.md "persistence
 * pattern".
 */
const inFreshContext = async (
  browser: Browser,
  fiftyoneLoader: AbstractFiftyoneLoader,
  verify: (modal: ModalPom) => Promise<void>
) => {
  const context = await browser.newContext();
  const freshPage = await context.newPage();

  try {
    await fiftyoneLoader.waitUntilGridVisible(freshPage, datasetName, {
      searchParams: new URLSearchParams({ id }),
    });
    const freshModal = new ModalPom(freshPage, new EventUtils(freshPage));
    await freshModal.waitForSampleLoadDomAttribute();
    await freshModal.sidebar.switchMode("annotate");

    await verify(freshModal);
  } finally {
    await context.close();
  }
};

test.describe.serial("2D annotation field move", () => {
  test("moving a label between fields re-homes it in one patch and round-trips through undo/redo", async ({
    modal,
    page,
  }) => {
    await reselect(modal);

    // Read the current field; move to the other one (relative → order-safe).
    const from = await modal.sidebar.edit.getCurrentField();
    const to = otherField(from);
    expect(FIELDS).toContain(from);

    // Count sample patches from a CLEAN baseline (selection doesn't dirty), so
    // the single engine transaction should be the only one that hits the wire.
    let patches = 0;
    const countPatch = (r: {
      url(): string;
      request(): { method(): string };
    }) => {
      if (/\/sample\//.test(r.url()) && isSamplePatch(r.request().method())) {
        patches += 1;
      }
    };
    page.on("response", countPatch);

    try {
      const saved = page.waitForResponse(
        (r) => /\/sample\//.test(r.url()) && isSamplePatch(r.request().method())
      );
      await modal.sidebar.edit.moveFieldTo(to);
      await saved;

      // The move deselected the label; re-select to read its new home.
      await reselect(modal);
      await expect.poll(() => modal.sidebar.edit.getCurrentField()).toBe(to);

      // One transaction → exactly one autosave patch (empty ticks are filtered).
      expect(patches).toBe(1);
    } finally {
      page.off("response", countPatch);
    }

    // Undo returns the label to its source field; redo re-applies the move.
    await modal.sidebar.edit.assert.undoIsEnabled();
    await modal.sidebar.edit.undo();
    await reselect(modal);
    await expect.poll(() => modal.sidebar.edit.getCurrentField()).toBe(from);

    await modal.sidebar.edit.assert.redoIsEnabled();
    await modal.sidebar.edit.redo();
    await reselect(modal);
    await expect.poll(() => modal.sidebar.edit.getCurrentField()).toBe(to);
  });

  test("a field move persists across a fresh load", async ({
    browser,
    fiftyoneLoader,
    modal,
    page,
  }) => {
    await reselect(modal);

    const from = await modal.sidebar.edit.getCurrentField();
    const to = otherField(from);

    const saved = page.waitForResponse(
      (r) => /\/sample\//.test(r.url()) && isSamplePatch(r.request().method())
    );
    await modal.sidebar.edit.moveFieldTo(to);
    await saved;

    await reselect(modal);
    await expect.poll(() => modal.sidebar.edit.getCurrentField()).toBe(to);

    await inFreshContext(browser, fiftyoneLoader, async (freshModal) => {
      await freshModal.sidebar.annotate.selectActiveLabel("cat", 0);
      await expect
        .poll(() => freshModal.sidebar.edit.getCurrentField())
        .toBe(to);
    });
  });
});
