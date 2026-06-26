/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * 2D label CLASS editing through the sidebar dropdown (DropdownView): changing a
 * detection's class updates the form, is undo/redo-able via the engine command
 * stack, and persists across a true round-trip. Exercises the MUI-Select-backed
 * dropdown path (distinct from the text/number inputs other specs drive).
 */
import { Browser, expect, test as base } from "src/oss/fixtures";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";
import { EventUtils } from "src/shared/event-utils";
import type { AbstractFiftyoneLoader } from "src/shared/abstract-loader";

const datasetName = getUniqueDatasetNameWithPrefix("annotate-2d-class");

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

/** Verify a persisted edit from a brand-new browser context (true round-trip). */
const inFreshContext = async (
  browser: Browser,
  fiftyoneLoader: AbstractFiftyoneLoader,
  verify: (modal: ModalPom) => Promise<void>,
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

test.describe.serial("2D label class editing", () => {
  test("changing a label's class updates the form and is undoable", async ({
    modal,
  }) => {
    await modal.sidebar.annotate.selectActiveLabel("cat", 0);
    await modal.sidebar.edit.assert.verifyFieldValue("label", "cat");
    await modal.sidebar.edit.assert.undoIsEnabled(false);

    await modal.sidebar.edit.selectFieldChoice("label", "dog");
    await modal.sidebar.edit.assert.verifyFieldValue("label", "dog");
    await modal.sidebar.edit.assert.undoIsEnabled();

    await modal.sidebar.edit.undo();
    await modal.sidebar.edit.assert.verifyFieldValue("label", "cat");

    await modal.sidebar.edit.redo();
    await modal.sidebar.edit.assert.verifyFieldValue("label", "dog");

    // leave the seeded box at its baseline class for sibling tests
    await modal.sidebar.edit.undo();
    await modal.sidebar.edit.assert.verifyFieldValue("label", "cat");
  });

  test("a class change persists across a fresh load", async ({
    browser,
    fiftyoneLoader,
    modal,
    page,
  }) => {
    await modal.sidebar.annotate.selectActiveLabel("cat", 0);

    const saved = page.waitForResponse(
      (r) =>
        /\/sample\//.test(r.url()) &&
        ["POST", "PATCH", "PUT"].includes(r.request().method()),
    );
    await modal.sidebar.edit.selectFieldChoice("label", "dog");
    await modal.sidebar.edit.assert.verifyFieldValue("label", "dog");
    await saved;

    // the box is now a "dog" — select it by its new class in the fresh context
    await inFreshContext(browser, fiftyoneLoader, async (freshModal) => {
      await freshModal.sidebar.annotate.selectActiveLabel("dog", 0);
      await freshModal.sidebar.edit.assert.verifyFieldValue("label", "dog");
    });
  });
});
