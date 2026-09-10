/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Moving a video track between same-type frame fields (`frames.detections`,
 * `frames.predictions`) through the edit-form dropdown: the whole track
 * re-homes, persists across a fresh browser context, and undoes/redoes.
 * Assertions are relative to the track's current field so the serial tests
 * don't depend on each other's end state.
 */
import { Browser, expect, test as base, type Page } from "src/oss/fixtures";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";
import { EventUtils } from "src/shared/event-utils";
import type { AbstractFiftyoneLoader } from "src/shared/abstract-loader";
import { videoAnnotationSeed } from "./annotate-video/seed";

const datasetName = getUniqueDatasetNameWithPrefix("annotate-video-field-move");

/** Fixed ObjectId addressing the first sample (so we can deep-link the modal). */
const id = "000000000000000000000000";

const FIELDS = ["frames.detections", "frames.predictions"] as const;
const otherField = (current: string) =>
  FIELDS.find((f) => f !== current) ?? FIELDS[0];

const CLASSES = ["vehicle", "person", "road sign"];

const savedSample = (page: Page) =>
  page.waitForResponse(
    (r) =>
      /\/sample\//.test(r.url()) &&
      ["POST", "PATCH", "PUT"].includes(r.request().method()),
  );

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

const openAnnotate = async (
  fiftyoneLoader: AbstractFiftyoneLoader,
  modal: ModalPom,
  page: Page,
) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
    searchParams: new URLSearchParams({ id }),
  });
  await modal.assert.isOpen();
  await modal.sidebar.switchMode("annotate");
  await modal.videoAnnotate.waitForSurface();
};

/** Re-select the track and return to a form-open state (a move drops the anchor). */
const reselect = async (modal: ModalPom, label = "vehicle") => {
  if (await modal.sidebar.edit.backButton.isVisible()) {
    await modal.sidebar.edit.exitToList();
  }
  await modal.videoAnnotate.selectLabel(label);
};

const inFreshContext = async (
  browser: Browser,
  fiftyoneLoader: AbstractFiftyoneLoader,
  verify: (modal: ModalPom) => Promise<void>,
) => {
  const context = await browser.newContext();
  const freshPage = await context.newPage();
  try {
    const freshModal = new ModalPom(freshPage, new EventUtils(freshPage));
    await openAnnotate(fiftyoneLoader, freshModal, freshPage);
    await verify(freshModal);
  } finally {
    await context.close();
  }
};

test.describe.serial("video annotation field move", () => {
  test.beforeEach(async ({ datasetFactory }) => {
    // a second per-frame Detections field (`frames.predictions`), active, so
    // the field-move dropdown offers it as a destination
    const seed = videoAnnotationSeed({
      withEvents: false,
      trackedSampleIndices: [0],
    });
    await datasetFactory.createDataset({
      mediaType: "video",
      datasetName,
      ...seed,
      schema: {
        ...seed.schema,
        "frames.predictions": "Detections",
        "frames.predictions.detections.keyframe": "BooleanField",
        "frames.predictions.detections.propagation": "DictField",
      },
      labelSchemas: {
        ...seed.labelSchemas,
        "frames.predictions": {
          type: "detections",
          component: "dropdown",
          attributes: [
            { name: "id", type: "id", component: "text", read_only: true },
            { name: "index", type: "int", component: "text" },
          ],
          classes: CLASSES,
        },
      },
    });
  });

  test("moving a track between frame fields re-homes it and persists", async ({
    browser,
    fiftyoneLoader,
    modal,
    page,
  }) => {
    await openAnnotate(fiftyoneLoader, modal, page);

    await modal.videoAnnotate.selectLabel("vehicle");
    const from = await modal.sidebar.edit.getCurrentField();
    const to = otherField(from);

    const saved = savedSample(page);
    await modal.sidebar.edit.moveFieldTo(to);
    await saved;

    await reselect(modal);
    await expect.poll(() => modal.sidebar.edit.getCurrentField()).toBe(to);

    await inFreshContext(browser, fiftyoneLoader, async (freshModal) => {
      await freshModal.videoAnnotate.selectLabel("vehicle");
      await expect
        .poll(() => freshModal.sidebar.edit.getCurrentField())
        .toBe(to);
    });
  });

  test("a video field move round-trips through undo/redo", async ({
    fiftyoneLoader,
    modal,
    page,
  }) => {
    await openAnnotate(fiftyoneLoader, modal, page);

    await modal.videoAnnotate.selectLabel("vehicle");
    const from = await modal.sidebar.edit.getCurrentField();
    const to = otherField(from);

    const saved = savedSample(page);
    await modal.sidebar.edit.moveFieldTo(to);
    await saved;
    await reselect(modal);
    await expect.poll(() => modal.sidebar.edit.getCurrentField()).toBe(to);

    await modal.sidebar.edit.assert.undoIsEnabled();
    await modal.sidebar.edit.undo();
    await reselect(modal);
    await expect.poll(() => modal.sidebar.edit.getCurrentField()).toBe(from);

    await modal.sidebar.edit.assert.redoIsEnabled();
    await modal.sidebar.edit.redo();
    await reselect(modal);
    await expect.poll(() => modal.sidebar.edit.getCurrentField()).toBe(to);
  });
});
