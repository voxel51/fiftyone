/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Creating and deleting a standalone sample-level Classification. Coverage only
 * exercised a *class change* on an existing detection; this covers the
 * Classification label itself:
 *   - the Classification action creates a label, opens the edit form, and
 *     commits the chosen class through the engine (persisted, true round-trip),
 *   - the classification can be deleted (the undo of that delete is a known
 *     engine gap — see the `test.fixme` below).
 *
 * Persistence is read back from Python (`getClassificationState`) — a true
 * server round-trip on the sample's `Classification` field.
 *
 * The create form pre-fills `label` with the first class; persistence is gated
 * on an actual `label` value being CHOSEN (consistent with label-creation
 * gating elsewhere — an empty/default classification isn't committed). So these
 * tests assign a NON-default class ("cloudy", the 2nd class) to exercise the
 * real create+persist path; re-selecting the pre-filled default would be a
 * no-op by design.
 */
import { expect, test as base, type Page } from "src/oss/fixtures";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix(
  "annotate-2d-classification",
);

/** Fixed ObjectId addressing the single sample (so we can deep-link the modal). */
const id = "000000000000000000000000";

const FIELD = "weather";

const savedSample = (page: Page) =>
  page.waitForResponse(
    (r) =>
      /\/sample\//.test(r.url()) &&
      ["POST", "PATCH", "PUT"].includes(r.request().method()),
  );

/** Clear the sample's classification so each serial test starts empty. */
const clearClassification = () => `
import fiftyone as fo

dataset = fo.load_dataset("${datasetName}")
sample = dataset.first()
sample["${FIELD}"] = None
sample.save()
`;

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
    schema: { [FIELD]: "Classification" },
  });
  await annotateSDK.updateLabelSchema(datasetName, FIELD, {
    type: "classification",
    classes: ["sunny", "cloudy"],
    attributes: [],
    component: "dropdown",
  });
  await annotateSDK.addFieldToActiveLabelSchema(datasetName, FIELD);
});

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test.describe.serial("2D annotation classification", () => {
  test.beforeEach(async ({ fiftyoneLoader, modal, page }) => {
    await fiftyoneLoader.executePythonCode(clearClassification());
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
      searchParams: new URLSearchParams({ id }),
    });
    await modal.waitForSampleLoadDomAttribute();
    await modal.assert.isOpen();
    await modal.sidebar.switchMode("annotate");
  });

  test("creating a classification assigns a class and persists", async ({
    annotateSDK,
    modal,
    page,
  }) => {
    await modal.sidebar.annotate.createClassification();

    // the new classification opens its edit form; choosing a (non-default)
    // class commits. "cloudy" is the 2nd class — distinct from the pre-filled
    // default — so this is a real value change, not a no-op.
    const saved = savedSample(page);
    await modal.sidebar.edit.selectFieldChoice("label", "cloudy");
    await modal.sidebar.edit.assert.verifyFieldValue("label", "cloudy");
    await saved;

    // true round-trip: the field holds the chosen class. Generous timeout —
    // the assign autosaves on the next tick and each poll round-trips Python.
    await expect
      .poll(
        async () =>
          (await annotateSDK.getClassificationState(datasetName, FIELD)).label,
        { timeout: 15_000 },
      )
      .toBe("cloudy");
  });

  test("a classification can be deleted", async ({
    annotateSDK,
    modal,
    page,
  }) => {
    await modal.sidebar.annotate.createClassification();
    const saved = savedSample(page);
    await modal.sidebar.edit.selectFieldChoice("label", "cloudy");
    await saved;
    await expect
      .poll(
        async () =>
          (await annotateSDK.getClassificationState(datasetName, FIELD)).label,
        { timeout: 15_000 },
      )
      .toBe("cloudy");

    // the new classification is selected (form open) — delete it.
    const deleted = savedSample(page);
    await modal.sidebar.edit.deleteLabel();
    await deleted;
    await expect
      .poll(
        async () =>
          (await annotateSDK.getClassificationState(datasetName, FIELD))
            .present,
        { timeout: 15_000 },
      )
      .toBe(false);
  });

  // KNOWN ENGINE GAP: undoing the delete of a standalone (non-list)
  // Classification does NOT restore it — the store keeps re-emitting
  // `remove /<field>` after undo instead of re-adding the label, so the field
  // stays empty. Single-label delete/undo isn't wired through the engine's
  // restore the way list labels are. Re-enable once the engine restores a
  // deleted single label on undo.
  test.fixme("a classification deletion is undoable", async ({
    annotateSDK,
    modal,
    page,
  }) => {
    await modal.sidebar.annotate.createClassification();
    const saved = savedSample(page);
    await modal.sidebar.edit.selectFieldChoice("label", "cloudy");
    await saved;
    await expect
      .poll(
        async () =>
          (await annotateSDK.getClassificationState(datasetName, FIELD)).label,
        { timeout: 15_000 },
      )
      .toBe("cloudy");

    const deleted = savedSample(page);
    await modal.sidebar.edit.deleteLabel();
    await deleted;

    await modal.sidebar.edit.assert.undoIsEnabled();
    const restored = savedSample(page);
    await modal.sidebar.edit.undo();
    await restored;
    await expect
      .poll(
        async () =>
          (await annotateSDK.getClassificationState(datasetName, FIELD)).label,
        { timeout: 15_000 },
      )
      .toBe("cloudy");
  });
});
