/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Oriented (rotated) bounding boxes in 2D annotation (FOEPD-4586): the scalar
 * `rotation` attribute (radians) round-trips DB → engine → edit form, edits
 * through the form's rotation field autosave and survive a fresh load, zeroing
 * a rotation overwrites the stored scalar, and boxes that were never rotated
 * never get a `rotation` attribute stamped onto them.
 *
 * Rotation is edited through the form input (the value set IS the stored
 * value); the canvas rotate-handle gesture geometry is pinned by
 * `DetectionOverlay` unit tests.
 */
import { Browser, expect, test as base } from "src/oss/fixtures";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";
import { EventUtils } from "src/shared/event-utils";
import type { AbstractFiftyoneLoader } from "src/shared/abstract-loader";

const datasetName = getUniqueDatasetNameWithPrefix("annotate-2d-rotate");

/** Fixed ObjectId addressing the single sample (so we can deep-link the modal). */
const id = "000000000000000000000000";

/** The seeded rotation on the "cat" box: 45 degrees, in radians. */
const SEEDED_ROTATION = Math.PI / 4;

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
          {
            _id: createId(),
            label: "cat",
            bounding_box: [0.4, 0.4, 0.2, 0.2],
            rotation: SEEDED_ROTATION,
          },
          {
            _id: createId(),
            label: "dog",
            bounding_box: [0.1, 0.1, 0.15, 0.15],
          },
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

/** Await the autosave POST/PATCH for the current edit. */
const awaitSave = (page: import("src/oss/fixtures").Page) =>
  page.waitForResponse(
    (r) =>
      /\/sample\//.test(r.url()) &&
      ["POST", "PATCH", "PUT"].includes(r.request().method()),
  );

/**
 * Open the dataset in a fresh browser context (no shared client cache — a true
 * server round-trip) and run `verify` against an annotate-mode modal there.
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

test.describe.serial("2D rotated bounding boxes", () => {
  test("a seeded rotation reaches the edit form's rotation field", async ({
    modal,
  }) => {
    await modal.sidebar.annotate.selectActiveLabel("cat", 0);

    await expect
      .poll(() => fieldNum(modal, "rotation.rotation"))
      .toBeCloseTo(SEEDED_ROTATION, 4);
  });

  test("a rotation edit persists across a fresh load", async ({
    browser,
    fiftyoneLoader,
    modal,
    page,
  }) => {
    await modal.sidebar.annotate.selectActiveLabel("cat", 0);

    const saved = awaitSave(page);
    await modal.sidebar.edit.setFieldValue("rotation.rotation", "1.5708");
    await expect
      .poll(() => fieldNum(modal, "rotation.rotation"))
      .toBeCloseTo(1.5708, 4);
    await saved;

    await inFreshContext(browser, fiftyoneLoader, async (freshModal) => {
      await freshModal.sidebar.annotate.selectActiveLabel("cat", 0);
      await expect
        .poll(() => fieldNum(freshModal, "rotation.rotation"))
        .toBeCloseTo(1.5708, 4);
    });
  });

  test("zeroing a rotation overwrites the stored scalar", async ({
    browser,
    fiftyoneLoader,
    modal,
    page,
  }) => {
    await modal.sidebar.annotate.selectActiveLabel("cat", 0);

    const saved = awaitSave(page);
    await modal.sidebar.edit.setFieldValue("rotation.rotation", "0");
    await saved;

    await inFreshContext(browser, fiftyoneLoader, async (freshModal) => {
      await freshModal.sidebar.annotate.selectActiveLabel("cat", 0);
      await expect
        .poll(() => fieldNum(freshModal, "rotation.rotation"))
        .toBeCloseTo(0, 4);
    });
  });

  test("editing an unrotated box never stamps a rotation attribute", async ({
    fiftyoneLoader,
    modal,
    page,
  }) => {
    await modal.sidebar.annotate.selectActiveLabel("dog", 0);

    const saved = awaitSave(page);
    await modal.sidebar.edit.setFieldValue("position.x", "0.123");
    await expect
      .poll(() => fieldNum(modal, "position.x"))
      .toBeCloseTo(0.123, 4);
    await saved;

    // the geometry edit round-tripped WITHOUT acquiring a rotation attribute
    await fiftyoneLoader.executePythonCode(`
import fiftyone as fo

dataset = fo.load_dataset("${datasetName}")
sample = dataset.first()
dog = [d for d in sample.detections.detections if d.label == "dog"][0]

assert abs(dog.bounding_box[0] - 0.123) < 1e-4, dog.bounding_box
assert getattr(dog, "rotation", None) is None, dog
    `);
  });
});
