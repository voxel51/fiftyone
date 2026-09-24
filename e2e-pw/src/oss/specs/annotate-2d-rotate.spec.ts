/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Oriented (rotated) bounding boxes in 2D annotation (FOEPD-4586): the scalar
 * `rotation` attribute (radians) round-trips DB → engine → edit form, renders
 * the box rotated, edits through the form's rotation field autosave and
 * survive a fresh load, zeroing a rotation overwrites the stored scalar, and a
 * box that was never rotated stays unrotated through an unrelated edit.
 *
 * Rotation is edited through the form input (the value set IS the stored
 * value); the canvas rotate-handle gesture geometry is pinned by
 * `DetectionOverlay` unit tests.
 */
import { Browser, test as base } from "src/oss/fixtures";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";
import { EventUtils } from "src/shared/event-utils";
import type { AbstractFiftyoneLoader } from "src/shared/abstract-loader";

/** Fixed ObjectId addressing the single sample (so we can deep-link the modal). */
const id = "000000000000000000000000";

/** The seeded rotation on the "cat" box: 45 degrees, in radians. */
const SEEDED_ROTATION = Math.PI / 4;

/** A rotation typed into the form: 90 degrees, at the form's 1e-4 step. */
const TYPED_ROTATION = "1.5708";

const test = base.extend<{ datasetName: string; modal: ModalPom }>({
  // a dataset per test: every case here mutates the seeded box, so sharing one
  // would order-couple the tests and stop any of them running alone
  datasetName: async ({ datasetFactory }, use) => {
    const datasetName = getUniqueDatasetNameWithPrefix("annotate-2d-rotate");

    await datasetFactory.createDataset({
      datasetName,
      imageOptions: { fillColor: "white", width: 640, height: 480 },
      schema: {
        detections: "Detections",
        // the seeded box carries it, and raw inserts bypass the ODM
        "detections.detections.rotation": "FloatField",
      },
      labelSchemas: {
        detections: {
          type: "detections",
          classes: ["cat", "dog"],
          attributes: [],
          component: "dropdown",
        },
      },
      withSampleData: (_, { label }) => ({
        detections: label.detections([
          label.detection({
            label: "cat",
            bounding_box: [0.4, 0.4, 0.2, 0.2],
            rotation: SEEDED_ROTATION,
          }),
          label.detection({
            label: "dog",
            bounding_box: [0.1, 0.1, 0.15, 0.15],
          }),
        ]),
      }),
    });

    await use(datasetName);
  },
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

test.beforeEach(async ({ datasetName, fiftyoneLoader, modal, page }) => {
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
  datasetName: string,
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

test.describe("2D rotated bounding boxes", () => {
  test("a seeded rotation reaches the edit form's rotation field", async ({
    modal,
  }) => {
    await modal.sidebar.annotate.selectActiveLabel("cat", 0);

    await modal.sidebar.edit.assert.hasFieldValue(
      "rotation.rotation",
      String(SEEDED_ROTATION),
    );
  });

  test("a seeded rotation renders the box rotated", async ({ modal }) => {
    await modal.sidebar.annotate.selectActiveLabel("cat", 0);

    await modal.sampleCanvas.assert.hasScreenshot(
      "rotated-detection-selected.png",
    );
  });

  test("a rotation edit persists across a fresh load", async ({
    browser,
    datasetName,
    fiftyoneLoader,
    modal,
  }) => {
    await modal.sidebar.annotate.selectActiveLabel("cat", 0);

    await modal.sidebar.edit.setFieldValue("rotation.rotation", TYPED_ROTATION);
    await modal.sidebar.edit.assert.hasFieldValue(
      "rotation.rotation",
      TYPED_ROTATION,
    );
    await modal.sidebar.annotate.waitForSavesSettled();

    await inFreshContext(
      browser,
      fiftyoneLoader,
      datasetName,
      async (freshModal) => {
        await freshModal.sidebar.annotate.selectActiveLabel("cat", 0);
        await freshModal.sidebar.edit.assert.hasFieldValue(
          "rotation.rotation",
          TYPED_ROTATION,
        );
      },
    );
  });

  test("zeroing a rotation overwrites the stored scalar", async ({
    browser,
    datasetName,
    fiftyoneLoader,
    modal,
  }) => {
    await modal.sidebar.annotate.selectActiveLabel("cat", 0);

    await modal.sidebar.edit.setFieldValue("rotation.rotation", "0");
    await modal.sidebar.edit.assert.hasFieldValue("rotation.rotation", "0");
    await modal.sidebar.annotate.waitForSavesSettled();

    await inFreshContext(
      browser,
      fiftyoneLoader,
      datasetName,
      async (freshModal) => {
        await freshModal.sidebar.annotate.selectActiveLabel("cat", 0);
        await freshModal.sidebar.edit.assert.hasFieldValue(
          "rotation.rotation",
          "0",
        );
      },
    );
  });

  test("editing an unrotated box round-trips with zero rotation", async ({
    browser,
    datasetName,
    fiftyoneLoader,
    modal,
  }) => {
    await modal.sidebar.annotate.selectActiveLabel("dog", 0);

    await modal.sidebar.edit.setFieldValue("position.x", "0.123");
    await modal.sidebar.edit.assert.hasFieldValue("position.x", "0.123");
    await modal.sidebar.annotate.waitForSavesSettled();

    // the form shows 0 for an absent attribute; that the geometry edit never
    // STAMPS `rotation` onto the box is pinned by the detectionAdapter tests
    await inFreshContext(
      browser,
      fiftyoneLoader,
      datasetName,
      async (freshModal) => {
        await freshModal.sidebar.annotate.selectActiveLabel("dog", 0);
        await freshModal.sidebar.edit.assert.hasFieldValue(
          "position.x",
          "0.123",
        );
        await freshModal.sidebar.edit.assert.hasFieldValue(
          "rotation.rotation",
          "0",
        );
      },
    );
  });
});
