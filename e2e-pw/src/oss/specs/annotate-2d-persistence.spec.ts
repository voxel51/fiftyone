/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * 2D edit/delete persistence: attribute, geometry and deletion edits made in
 * the sidebar form autosave and are verified from a brand-new browser
 * context. Operates on the single seeded box so selection is unambiguous.
 */
import { Browser, test as base } from "src/oss/fixtures";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";
import { EventUtils } from "src/shared/event-utils";
import type { AbstractFiftyoneLoader } from "src/shared/abstract-loader";

const datasetName = getUniqueDatasetNameWithPrefix("annotate-2d-persistence");

/** Fixed ObjectId addressing the single sample (so we can deep-link the modal). */
const id = "000000000000000000000000";

const test = base.extend<{ modal: ModalPom }>({
  modal: async ({ page, eventUtils }, use) => {
    await use(new ModalPom(page, eventUtils));
  },
});

test.beforeAll(async ({ datasetFactory, foWebServer }) => {
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
    labelSchemas: {
      detections: {
        type: "detections",
        classes: ["cat", "dog"],
        attributes: [{ name: "confidence", type: "float", component: "text" }],
        component: "dropdown",
      },
    },
  });
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
/**
 * Open the dataset in a fresh browser context (no shared client cache, single
 * clean load — a true server round-trip) and run `verify` against an
 * annotate-mode modal there. See ANNOTATION_E2E_TEST_NOTES.md "persistence
 * pattern" for why a page.reload() can't be used.
 */
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

test.describe.serial("2D annotation edit/delete persistence", () => {
  // tests 1 & 2 edit the seeded box (its existence is preserved); test 3 deletes
  // it, so it must run last (serial order is guaranteed).

  test("an attribute edit persists across a fresh load", async ({
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
    await modal.sidebar.edit.setFieldValue("confidence", "0.7");
    await modal.sidebar.edit.assert.verifyFieldValue("confidence", "0.7");
    await saved;

    await inFreshContext(browser, fiftyoneLoader, async (freshModal) => {
      await freshModal.sidebar.annotate.selectActiveLabel("cat", 0);
      await freshModal.sidebar.edit.assert.verifyFieldValue(
        "confidence",
        "0.7",
      );
    });
  });

  test("a geometry edit persists across a fresh load", async ({
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
    await modal.sidebar.edit.setFieldValue("position.x", "0.111");
    await modal.sidebar.edit.assert.verifyFieldValue("position.x", "0.111");
    await saved;

    await inFreshContext(browser, fiftyoneLoader, async (freshModal) => {
      await freshModal.sidebar.annotate.selectActiveLabel("cat", 0);
      await freshModal.sidebar.edit.assert.verifyFieldValue(
        "position.x",
        "0.111",
      );
    });
  });

  test("a delete persists across a fresh load", async ({
    browser,
    fiftyoneLoader,
    modal,
    page,
  }) => {
    const before = await modal.sidebar.annotate.getActiveLabelsCount();

    const saved = page.waitForResponse(
      (r) =>
        /\/sample\//.test(r.url()) &&
        ["POST", "PATCH", "PUT"].includes(r.request().method()),
    );
    await modal.sidebar.annotate.selectActiveLabel("cat", 0);
    await page.keyboard.press("Backspace");
    await modal.sidebar.annotate.assert.hasActiveLabelsCount(before - 1);
    await saved;

    await inFreshContext(browser, fiftyoneLoader, async (freshModal) => {
      await freshModal.sidebar.annotate.assert.hasActiveLabelsCount(before - 1);
    });
  });
});
