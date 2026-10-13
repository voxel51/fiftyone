/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Creating and deleting a standalone sample-level Classification, verified in
 * a fresh browser context. The create form pre-fills the first class and
 * persistence is gated on a class being chosen, so these tests assign the
 * non-default "cloudy".
 */
import { expect, Page, test as base } from "src/oss/fixtures";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";
import { EventUtils } from "src/shared/event-utils";
import type { AbstractFiftyoneLoader } from "src/shared/abstract-loader";

const datasetName = getUniqueDatasetNameWithPrefix(
  "annotate-2d-classification",
);

/** Fixed ObjectId addressing the single sample (so we can deep-link the modal). */
const id = "000000000000000000000000";

const FIELD = "weather";

/**
 * Assert the persisted classification from a brand-new browser context and
 * return that context's modal (the test's original page is closed).
 */
const expectPersistedClassification = async (
  openFreshPage: () => Promise<Page>,
  fiftyoneLoader: AbstractFiftyoneLoader,
  label: string | null,
) => {
  const freshPage = await openFreshPage();
  const freshModal = new ModalPom(freshPage, new EventUtils(freshPage));
  await fiftyoneLoader.waitUntilGridVisible(freshPage, datasetName, {
    searchParams: new URLSearchParams({ id }),
    modalSample: "loaded",
  });
  await freshModal.assert.isOpen();
  await freshModal.sidebar.annotate.afterLabelList(() =>
    freshModal.sidebar.switchMode("annotate"),
  );
  const rows = freshModal.sidebar.annotate.labelRowsFor(FIELD);
  expect(await rows.count()).toBe(label === null ? 0 : 1);
  if (label !== null) {
    expect(await rows.getAttribute("data-cy-label")).toBe(label);
  }
  return freshModal;
};

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

test.describe.serial("2D annotation classification", () => {
  test.beforeEach(async ({ datasetFactory, fiftyoneLoader, modal, page }) => {
    // a fresh dataset per test so each serial test starts empty
    await datasetFactory.createDataset({
      datasetName,
      imageOptions: { fillColor: "white", width: 640, height: 480 },
      schema: { [FIELD]: "Classification" },
      labelSchemas: {
        [FIELD]: {
          type: "classification",
          classes: ["sunny", "cloudy"],
          attributes: [],
          component: "dropdown",
        },
      },
    });
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
      searchParams: new URLSearchParams({ id }),
      modalSample: "loaded",
    });
    await modal.assert.isOpen();
    await modal.afterLighterReady(() => modal.sidebar.switchMode("annotate"));
  });

  test("a classification can be deleted", async ({
    fiftyoneLoader,
    modal,
    openFreshPage,
  }) => {
    await modal.sidebar.annotate.createClassification();
    await modal.sidebar.annotate.afterSave(() =>
      modal.sidebar.edit.selectFieldChoice("label", "cloudy"),
    );
    const freshModal = await expectPersistedClassification(
      openFreshPage,
      fiftyoneLoader,
      "cloudy",
    );

    await freshModal.sidebar.annotate.selectActiveLabel("cloudy", 0);
    await freshModal.sidebar.annotate.afterSave(() =>
      freshModal.sidebar.edit.deleteLabel(),
    );
    await expectPersistedClassification(openFreshPage, fiftyoneLoader, null);
  });

  // KNOWN ENGINE GAP: undoing the delete of a standalone Classification does
  // not restore it (the store re-emits `remove /<field>` instead of re-adding
  // the label). Re-enable once the engine restores a deleted single label.
  test.fixme("a classification deletion is undoable", async ({
    fiftyoneLoader,
    modal,
    openFreshPage,
  }) => {
    await modal.sidebar.annotate.createClassification();
    await modal.sidebar.annotate.afterSave(() =>
      modal.sidebar.edit.selectFieldChoice("label", "cloudy"),
    );
    const freshModal = await expectPersistedClassification(
      openFreshPage,
      fiftyoneLoader,
      "cloudy",
    );

    await freshModal.sidebar.annotate.selectActiveLabel("cloudy", 0);
    await freshModal.sidebar.annotate.afterSave(() =>
      freshModal.sidebar.edit.deleteLabel(),
    );

    await freshModal.sidebar.edit.assert.undoIsEnabled();
    await freshModal.sidebar.annotate.afterSave(() =>
      freshModal.sidebar.edit.undo(),
    );
    await expectPersistedClassification(
      openFreshPage,
      fiftyoneLoader,
      "cloudy",
    );
  });
});
