/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Create round-trip for non-box label types on the video-annotation surface:
 * drawing a polyline and painting an instance mask each add a track, open the
 * edit form, commit through the engine on class assignment, and survive a true
 * round-trip (fresh browser context).
 *
 * The video surface wires these the same way the image surface does, but
 * through its own bridge: polylines self-create via the
 * `usePolylineModeInstaller` creation handler; a brush stroke with nothing
 * selected fires `lighter:overlay-create`, which opens a fresh masked detection
 * (segmentation mode) on the engine frame path. Detection-box draw is covered
 * separately (`MISSING-annotate-video-draw.spec.ts`).
 */
import { Browser, test as base, type Page } from "src/oss/fixtures";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";
import { EventUtils } from "src/shared/event-utils";
import type { AbstractFiftyoneLoader } from "src/shared/abstract-loader";

const datasetName = getUniqueDatasetNameWithPrefix(
  "annotate-video-label-types-create",
);

/** Fixed ObjectId addressing the first sample (so we can deep-link the modal). */
const id = "000000000000000000000000";
const clip = `/tmp/${datasetName}.webm`;

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

/** Open the modal in annotate mode on the deep-linked video sample. */
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

/** A sample-mutating autosave (the engine commit that persists the draw). */
const savedSample = (page: Page) =>
  page.waitForResponse(
    (r) =>
      /\/sample\//.test(r.url()) &&
      ["POST", "PATCH", "PUT"].includes(r.request().method()),
  );

test.describe.serial("video non-box label create", () => {
  // Re-seed a clean slate per test (polylines field + schema active, no tracks):
  // these run serially against one dataset, so a persisted draw from one test
  // would otherwise leave a stray track that the next test's count picks up.
  test.beforeEach(async ({ videoAnnotateSDK }) => {
    await videoAnnotateSDK.seed({
      datasetName,
      videoPaths: [clip],
      withPolylineField: true,
    });
  });

  test("drawing a polyline adds a track, assigns a class, and persists", async ({
    browser,
    fiftyoneLoader,
    modal,
    page,
  }) => {
    await openAnnotate(fiftyoneLoader, modal, page);

    // capture the live count first — earlier tests persist, so siblings can't
    // assume a clean slate.
    const before = (await modal.videoAnnotate.objectTrackIds()).length;

    await modal.sidebar.annotate.polylineMode();
    await modal.videoAnnotate.drawPolyline([
      [0.45, 0.45],
      [0.6, 0.45],
      [0.52, 0.6],
    ]);

    // the draw creates exactly one new object track on the timeline
    await modal.videoAnnotate.assert.objectTrackCount(before + 1);

    // the freshly-drawn polyline opens its edit form; assigning a class commits
    const saved = savedSample(page);
    await modal.sidebar.edit.selectFieldChoice("label", "person");
    await modal.sidebar.edit.assert.verifyFieldValue("label", "person");
    await saved;

    // the polyline frame label survives a true round-trip — exactly one object
    // track persists on the clean-slate timeline (the class is verified live
    // above; a single-frame polyline isn't reliably playhead-listed on reload).
    await inFreshContext(browser, fiftyoneLoader, async (freshModal) => {
      await freshModal.videoAnnotate.assert.objectTrackCount(before + 1);
    });
  });

  test("painting a mask adds a track, assigns a class, and persists", async ({
    browser,
    fiftyoneLoader,
    modal,
    page,
  }) => {
    await openAnnotate(fiftyoneLoader, modal, page);

    const before = (await modal.videoAnnotate.objectTrackIds()).length;

    await modal.sidebar.annotate.segmentationMode();
    await modal.sidebar.edit.selectBrushTool();
    await modal.videoAnnotate.paintMaskStroke([
      [0.4, 0.4],
      [0.48, 0.48],
      [0.56, 0.56],
    ]);

    // the paint creates exactly one new masked-detection track
    await modal.videoAnnotate.assert.objectTrackCount(before + 1);

    // the new detection carries a mask, and assigning a class commits it
    await modal.sidebar.edit.assert.hasMask(true);
    // the sidebar mask preview renders — proving the open form resolved the
    // live masked overlay by the track's instance id, not a maskless stub
    await modal.sidebar.edit.assert.hasMaskPreview(true);
    const saved = savedSample(page);
    await modal.sidebar.edit.selectFieldChoice("label", "vehicle");
    await modal.sidebar.edit.assert.verifyFieldValue("label", "vehicle");
    await saved;

    // the masked detection survives a true round-trip with its mask intact
    await inFreshContext(browser, fiftyoneLoader, async (freshModal) => {
      await freshModal.videoAnnotate.assert.objectTrackCount(before + 1);
      await freshModal.videoAnnotate.selectLabel("vehicle");
      await freshModal.sidebar.edit.assert.hasMask(true);
      await freshModal.sidebar.edit.assert.hasMaskPreview(true);
    });
  });
});
