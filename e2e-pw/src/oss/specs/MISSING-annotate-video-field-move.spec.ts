/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Moving a video track between per-frame fields of the same type. Image
 * field-move was covered; video was not. Two same-type frame Detections fields
 * (`frames.detections`, `frames.predictions`) give the Edit-form field dropdown
 * a destination, so a track move:
 *   - re-homes the whole track onto the destination frame field and persists
 *     across a true server round-trip,
 *   - round-trips through undo/redo on the shared engine stack.
 *
 * Assertions are RELATIVE to the track's current field (read first), so the
 * serial tests don't depend on each other's end state.
 */
import { Browser, expect, test as base, type Page } from "src/oss/fixtures";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";
import { EventUtils } from "src/shared/event-utils";
import type { AbstractFiftyoneLoader } from "src/shared/abstract-loader";

const datasetName = getUniqueDatasetNameWithPrefix("annotate-video-field-move");

/** Fixed ObjectId addressing the first sample (so we can deep-link the modal). */
const id = "000000000000000000000000";
const clip = `/tmp/${datasetName}.webm`;

const FIELDS = ["frames.detections", "frames.predictions"] as const;
const otherField = (current: string) =>
  FIELDS.find((f) => f !== current) ?? FIELDS[0];

const CLASSES = ["vehicle", "person", "road sign"];

const savedSample = (page: Page) =>
  page.waitForResponse(
    (r) =>
      /\/sample\//.test(r.url()) &&
      ["POST", "PATCH", "PUT"].includes(r.request().method())
  );

/**
 * Declare a second per-frame Detections field (`frames.predictions`) and add it
 * to the active label schemas so the field-move dropdown offers it as a
 * destination. Mirrors how the seed declares `frames.detections`.
 */
const addPredictionsField = (loader: AbstractFiftyoneLoader) =>
  loader.executePythonCode(`
import fiftyone as fo

dataset = fo.load_dataset("${datasetName}")
dataset.add_frame_field(
    "predictions", fo.EmbeddedDocumentField, embedded_doc_type=fo.Detections
)
dataset.add_frame_field("predictions.detections.keyframe", fo.BooleanField)
dataset.add_frame_field("predictions.detections.propagation", fo.DictField)

schema = {
    "type": "detections",
    "component": "dropdown",
    "attributes": [
        {"name": "id", "type": "id", "component": "text", "read_only": True},
        {"name": "index", "type": "int", "component": "text"},
    ],
    "classes": ${JSON.stringify(CLASSES)},
}
dataset.update_label_schema("frames.predictions", schema, allow_new_attrs=True)
if "frames.predictions" not in dataset.active_label_schemas:
    dataset.active_label_schemas = dataset.active_label_schemas + [
        "frames.predictions"
    ]
dataset.save()
`);

const test = base.extend<{ modal: ModalPom }>({
  modal: async ({ page, eventUtils }, use) => {
    await use(new ModalPom(page, eventUtils));
  },
});

test.beforeAll(async ({ foWebServer, mediaFactory }) => {
  await foWebServer.startWebServer();
  await mediaFactory.createVideo({
    outputPath: clip,
    duration: 2,
    width: 64,
    height: 64,
    frameRate: 10,
    color: "#3050a0",
  });
});

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

const openAnnotate = async (
  fiftyoneLoader: AbstractFiftyoneLoader,
  modal: ModalPom,
  page: Page
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
  verify: (modal: ModalPom) => Promise<void>
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
  test.beforeEach(async ({ fiftyoneLoader, videoAnnotateSDK }) => {
    await videoAnnotateSDK.seed({
      datasetName,
      videoPaths: [clip],
      withEvents: false,
      trackedSampleIndices: [0],
    });
    await addPredictionsField(fiftyoneLoader);
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
