/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Creating and deleting a standalone sample-level Regression, verified in a
 * fresh browser context. The Regression action creates a label and opens the
 * edit form with a numeric `value` input and no class picker.
 */
import { Browser, expect, test as base } from "src/oss/fixtures";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";
import { EventUtils } from "src/shared/event-utils";
import type { AbstractFiftyoneLoader } from "src/shared/abstract-loader";

const datasetName = getUniqueDatasetNameWithPrefix("annotate-2d-regression");

/** Fixed ObjectId addressing the single sample (so we can deep-link the modal). */
const id = "000000000000000000000000";

const FIELD = "score";
const VALUE = "0.75";

/** Assert the persisted regression from a brand-new browser context. */
const expectPersistedRegression = async (
  browser: Browser,
  fiftyoneLoader: AbstractFiftyoneLoader,
  value: string | null,
) => {
  const context = await browser.newContext();
  const freshPage = await context.newPage();
  try {
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
    expect(await rows.count()).toBe(value === null ? 0 : 1);
    if (value !== null) {
      expect(await rows.getAttribute("data-cy-label")).toBe(value);
    }
  } finally {
    await context.close();
  }
};

/**
 * Type the value and resolve once it is saved. Creating the regression first
 * saves it without a value, so the save is the one whose patch carries it.
 */
const saveValue = (modal: ModalPom) =>
  modal.sidebar.annotate.afterSave(async () => {
    const saved = modal.sidebar.annotate.waitForPatchContaining(VALUE);
    await modal.sidebar.edit.setFieldValue("value", VALUE);
    await saved;
  });

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

test.describe.serial("2D annotation regression", () => {
  test.beforeEach(async ({ datasetFactory, fiftyoneLoader, modal, page }) => {
    // a fresh dataset per test so each serial test starts empty
    await datasetFactory.createDataset({
      datasetName,
      imageOptions: { fillColor: "white", width: 640, height: 480 },
      schema: { [FIELD]: "Regression" },
      labelSchemas: {
        [FIELD]: {
          type: "regression",
          attributes: [{ name: "value", type: "float", component: "text" }],
        },
      },
    });
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
      searchParams: new URLSearchParams({ id }),
      modalSample: "loaded",
    });
    await modal.assert.isOpen();
    await modal.sidebar.switchMode("annotate");
  });

  test("creating a regression assigns a value and persists", async ({
    browser,
    fiftyoneLoader,
    modal,
  }) => {
    await modal.sidebar.annotate.afterEditing(() =>
      modal.sidebar.annotate.createRegression(),
    );

    // a regression has a numeric value and no class picker
    expect(await modal.sidebar.edit.getFieldContainer("label").count()).toBe(0);
    await saveValue(modal);
    await modal.sidebar.edit.assert.verifyFieldValue("value", VALUE);

    await expectPersistedRegression(browser, fiftyoneLoader, VALUE);
  });

  test("a regression can be deleted", async ({
    browser,
    fiftyoneLoader,
    modal,
  }) => {
    await modal.sidebar.annotate.afterEditing(() =>
      modal.sidebar.annotate.createRegression(),
    );
    await saveValue(modal);
    await expectPersistedRegression(browser, fiftyoneLoader, VALUE);

    await modal.sidebar.annotate.afterSave(() =>
      modal.sidebar.edit.deleteLabel(),
    );
    await expectPersistedRegression(browser, fiftyoneLoader, null);
  });
});
