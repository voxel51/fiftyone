/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Creating and deleting a standalone sample-level Classification, verified in
 * a fresh browser context. The create form pre-fills the first class and
 * persistence is gated on a class being chosen, so these tests assign the
 * non-default "cloudy".
 */
import { Browser, expect, test as base } from "src/oss/fixtures";
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

/** Assert the persisted classification from a brand-new browser context. */
const expectPersistedClassification = async (
  browser: Browser,
  fiftyoneLoader: AbstractFiftyoneLoader,
  label: string | null,
) => {
  const context = await browser.newContext();
  const freshPage = await context.newPage();
  try {
    const freshModal = new ModalPom(freshPage, new EventUtils(freshPage));
    await fiftyoneLoader.waitUntilGridVisible(freshPage, datasetName, {
      searchParams: new URLSearchParams({ id }),
    });
    await freshModal.waitForSampleLoadDomAttribute();
    await freshModal.assert.isOpen();
    await freshModal.sidebar.switchMode("annotate");
    const rows = freshModal.sidebar.annotate.labelRowsFor(FIELD);
    await expect(rows).toHaveCount(label === null ? 0 : 1);
    if (label !== null) {
      await expect(rows).toHaveAttribute("data-cy-label", label);
    }
  } finally {
    await context.close();
  }
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
    });
    await modal.waitForSampleLoadDomAttribute();
    await modal.assert.isOpen();
    await modal.sidebar.switchMode("annotate");
  });

  // flaky: passed only on retry in CI
  test.skip("creating a classification assigns a class and persists", async ({
    browser,
    fiftyoneLoader,
    modal,
  }) => {
    await modal.sidebar.annotate.createClassification();

    // the new classification opens its edit form; choosing a (non-default)
    // class commits. "cloudy" is the 2nd class — distinct from the pre-filled
    // default — so this is a real value change, not a no-op.
    const saved = modal.sidebar.annotate.waitForPatch();
    await modal.sidebar.edit.selectFieldChoice("label", "cloudy");
    await modal.sidebar.edit.assert.verifyFieldValue("label", "cloudy");
    await saved;

    // true round-trip: the field holds the chosen class
    await expectPersistedClassification(browser, fiftyoneLoader, "cloudy");
  });

  test("a classification can be deleted", async ({
    browser,
    fiftyoneLoader,
    modal,
  }) => {
    await modal.sidebar.annotate.createClassification();
    const saved = modal.sidebar.annotate.waitForPatch();
    await modal.sidebar.edit.selectFieldChoice("label", "cloudy");
    await saved;
    await expectPersistedClassification(browser, fiftyoneLoader, "cloudy");

    // the new classification is selected (form open) — delete it.
    const deleted = modal.sidebar.annotate.waitForPatch();
    await modal.sidebar.edit.deleteLabel();
    await deleted;
    await expectPersistedClassification(browser, fiftyoneLoader, null);
  });

  // KNOWN ENGINE GAP: undoing the delete of a standalone Classification does
  // not restore it (the store re-emits `remove /<field>` instead of re-adding
  // the label). Re-enable once the engine restores a deleted single label.
  test.fixme("a classification deletion is undoable", async ({
    browser,
    fiftyoneLoader,
    modal,
  }) => {
    await modal.sidebar.annotate.createClassification();
    const saved = modal.sidebar.annotate.waitForPatch();
    await modal.sidebar.edit.selectFieldChoice("label", "cloudy");
    await saved;
    await expectPersistedClassification(browser, fiftyoneLoader, "cloudy");

    const deleted = modal.sidebar.annotate.waitForPatch();
    await modal.sidebar.edit.deleteLabel();
    await deleted;

    await modal.sidebar.edit.assert.undoIsEnabled();
    const restored = modal.sidebar.annotate.waitForPatch();
    await modal.sidebar.edit.undo();
    await restored;
    await expectPersistedClassification(browser, fiftyoneLoader, "cloudy");
  });
});
