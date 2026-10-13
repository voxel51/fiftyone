/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * 2D label CLASS editing through the sidebar dropdown (DropdownView): changing a
 * detection's class updates the form, is undo/redo-able via the engine command
 * stack, and persists across a true round-trip. Exercises the MUI-Select-backed
 * dropdown path (distinct from the text/number inputs other specs drive).
 */
import { Page, test as base } from "src/oss/fixtures";
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
        attributes: [],
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
    modalSample: "loaded",
  });
  await modal.assert.isOpen();
  await modal.afterLighterReady(() => modal.sidebar.switchMode("annotate"));
});

/** Verify a persisted edit from a brand-new browser context (true round-trip). */
const inFreshContext = async (
  openFreshPage: () => Promise<Page>,
  fiftyoneLoader: AbstractFiftyoneLoader,
  verify: (modal: ModalPom) => Promise<void>,
) => {
  const freshPage = await openFreshPage();
  await fiftyoneLoader.waitUntilGridVisible(freshPage, datasetName, {
    searchParams: new URLSearchParams({ id }),
    modalSample: "loaded",
  });
  const freshModal = new ModalPom(freshPage, new EventUtils(freshPage));
  await freshModal.afterLighterReady(() =>
    freshModal.sidebar.switchMode("annotate"),
  );

  await verify(freshModal);
};

test.describe.serial("2D label class editing", () => {
  test("changing a label's class updates the form and is undoable", async ({
    modal,
  }) => {
    await modal.sidebar.annotate.selectActiveLabel("cat", 0);
    await modal.sidebar.edit.assert.verifyFieldValue("label", "cat");
    await modal.sidebar.edit.assert.undoIsEnabled(false);

    // each step is saved before the next, so every step differs from the
    // stored class and writes; unsaved steps that net back to the stored
    // class would write nothing
    await modal.sidebar.annotate.afterSave(() =>
      modal.sidebar.edit.selectFieldChoice("label", "dog"),
    );
    await modal.sidebar.edit.assert.verifyFieldValue("label", "dog");
    await modal.sidebar.edit.assert.undoIsEnabled();

    await modal.sidebar.annotate.afterSave(() => modal.sidebar.edit.undo());
    await modal.sidebar.edit.assert.verifyFieldValue("label", "cat");

    await modal.sidebar.annotate.afterSave(() => modal.sidebar.edit.redo());
    await modal.sidebar.edit.assert.verifyFieldValue("label", "dog");

    // leave the seeded box at its baseline class for sibling tests; the next
    // test's navigation would destroy an unsaved undo
    await modal.sidebar.annotate.afterSave(() => modal.sidebar.edit.undo());
    await modal.sidebar.edit.assert.verifyFieldValue("label", "cat");
  });

  test("a class change persists across a fresh load", async ({
    fiftyoneLoader,
    modal,
    openFreshPage,
  }) => {
    await modal.sidebar.annotate.selectActiveLabel("cat", 0);

    await modal.sidebar.annotate.afterSave(() =>
      modal.sidebar.edit.selectFieldChoice("label", "dog"),
    );
    await modal.sidebar.edit.assert.verifyFieldValue("label", "dog");

    // the box is now a "dog" — select it by its new class in the fresh context
    await inFreshContext(openFreshPage, fiftyoneLoader, async (freshModal) => {
      await freshModal.sidebar.annotate.selectActiveLabel("dog", 0);
      await freshModal.sidebar.edit.assert.verifyFieldValue("label", "dog");
    });
  });
});
