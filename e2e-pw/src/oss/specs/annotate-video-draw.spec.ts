/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Per-frame detection drawing on the video surface: a box drawn in detection
 * mode adds a timeline track, opens its edit form, commits on class assignment,
 * and survives a fresh browser context. Foundational coverage for video on the
 * annotation engine.
 */
import { Browser, test as base } from "src/oss/fixtures";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";
import { EventUtils } from "src/shared/event-utils";
import type { AbstractFiftyoneLoader } from "src/shared/abstract-loader";

const datasetName = getUniqueDatasetNameWithPrefix("annotate-video-draw");

/** Fixed ObjectId addressing the first sample (so we can deep-link the modal). */
const id = "000000000000000000000000";

const test = base.extend<{ modal: ModalPom }>({
  modal: async ({ page, eventUtils }, use) => {
    await use(new ModalPom(page, eventUtils));
  },
});

test.beforeAll(async ({ foWebServer, datasetFactory }) => {
  await foWebServer.startWebServer();
  // clean slate (no pre-seeded tracks): drawing is the only object track.
  await datasetFactory.createDataset({
    mediaType: "video",
    datasetName,
    sampleFrames: true,
    schema: {
      "frames.detections": "Detections",
      "frames.detections.detections.instance": "Instance",
      "frames.detections.detections.keyframe": "BooleanField",
      "frames.detections.detections.propagation": "DictField",
      events: "TemporalDetections",
    },
    labelSchemas: {
      "frames.detections": {
        type: "detections",
        component: "dropdown",
        classes: ["vehicle", "person", "road sign"],
        attributes: [
          { name: "id", type: "id", component: "text", read_only: true },
          { name: "tags", type: "list<str>", component: "text" },
          { name: "confidence", type: "float", component: "text" },
          { name: "index", type: "int", component: "text" },
          { name: "mask_path", type: "str", component: "text" },
        ],
      },
      events: {
        type: "temporaldetections",
        component: "dropdown",
        classes: ["approach", "pass", "depart"],
        attributes: [
          { name: "id", type: "id", component: "text", read_only: true },
        ],
      },
    },
    // three events split the clip into thirds
    withSampleData: ({ numFrames }, { label }) => {
      const a = Math.max(1, Math.floor(numFrames / 3));
      const b = Math.max(a + 1, Math.floor((2 * numFrames) / 3));
      return {
        events: label.temporalDetections([
          label.temporalDetection({ label: "approach", support: [1, a] }),
          label.temporalDetection({ label: "pass", support: [a + 1, b] }),
          label.temporalDetection({
            label: "depart",
            support: [b + 1, numFrames],
          }),
        ]),
      };
    },
    // present-but-empty on every frame, so the first draw's patch can append
    withFrameData: (_, { label }) => ({ detections: label.detections([]) }),
  });
});

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

/** Open the modal in annotate mode on the deep-linked video sample. */
const openAnnotate = async (
  fiftyoneLoader: AbstractFiftyoneLoader,
  modal: ModalPom,
  page: import("src/oss/fixtures").Page,
) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
    searchParams: new URLSearchParams({ id }),
  });
  await modal.assert.isOpen();
  await modal.sidebar.switchMode("annotate");
  await modal.videoAnnotate.waitForSurface();
};

/** Verify persisted state from a brand-new browser context (true round-trip). */
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

test.describe.serial("video per-frame detection drawing", () => {
  test("drawing a box adds a timeline track, opens its editor, and persists", async ({
    browser,
    fiftyoneLoader,
    modal,
    page,
  }) => {
    await openAnnotate(fiftyoneLoader, modal, page);

    // clean slate: no object tracks yet
    await modal.videoAnnotate.assert.objectTrackCount(0);

    // draw a box in detection mode
    await modal.sidebar.annotate.detectionMode("Detections");
    await modal.sampleCanvas.move(0.55, 0.55);
    await modal.sampleCanvas.down();
    await modal.sampleCanvas.move(0.78, 0.78);
    await modal.sampleCanvas.up();

    // the draw creates exactly one object track on the timeline
    await modal.videoAnnotate.assert.objectTrackCount(1);

    // the freshly-drawn box opens its edit form; assigning a class commits it
    const saved = page.waitForResponse(
      (r) =>
        /\/sample\//.test(r.url()) &&
        ["POST", "PATCH", "PUT"].includes(r.request().method()),
    );
    await modal.sidebar.edit.selectFieldChoice("label", "person");
    await modal.sidebar.edit.assert.verifyFieldValue("label", "person");
    await saved;

    // the frame label survives a true round-trip
    await inFreshContext(browser, fiftyoneLoader, async (freshModal) => {
      await freshModal.videoAnnotate.assert.objectTrackCount(1);
    });
  });
});
