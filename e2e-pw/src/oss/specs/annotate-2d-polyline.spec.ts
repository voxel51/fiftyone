/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Creating and deleting a 2D polyline on the image surface. Image polyline was
 * previously read-only in coverage (only video polyline create was tested):
 *   - activating polyline mode and clicking vertices self-creates a Polyline,
 *     opens the edit form, commits on class assignment, and persists across a
 *     true server round-trip (fresh browser context),
 *   - the polyline can be deleted, and the delete is undoable on the engine
 *     stack.
 *
 * The polyline self-creates through the same `usePolylineMode` creation handler
 * the video surface uses; here it runs on the image (Lighter) canvas.
 */
import { Browser, expect, test as base, type Page } from "src/oss/fixtures";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";
import { EventUtils } from "src/shared/event-utils";
import type { AbstractFiftyoneLoader } from "src/shared/abstract-loader";

const datasetName = getUniqueDatasetNameWithPrefix("annotate-2d-polyline");

/** Fixed ObjectId addressing the single sample (so we can deep-link the modal). */
const id = "000000000000000000000000";

/** A closed-ish triangle of container-relative [0,1] vertices. */
const TRIANGLE: Array<[number, number]> = [
  [0.35, 0.35],
  [0.6, 0.35],
  [0.48, 0.6],
];

const savedSample = (page: Page) =>
  page.waitForResponse(
    (r) =>
      /\/sample\//.test(r.url()) &&
      ["POST", "PATCH", "PUT"].includes(r.request().method()),
  );

/** Clear the sample's polylines so each serial test starts from zero. */
const clearPolylines = () => `
import fiftyone as fo

dataset = fo.load_dataset("${datasetName}")
sample = dataset.first()
sample.polylines = fo.Polylines(polylines=[])
sample.save()
`;

const test = base.extend<{ modal: ModalPom }>({
  modal: async ({ page, eventUtils }, use) => {
    await use(new ModalPom(page, eventUtils));
  },
});

/** Click each vertex on the image canvas (polyline mode must be active). */
const drawPolyline = async (
  modal: ModalPom,
  vertices: Array<[number, number]>,
) => {
  for (const [x, y] of vertices) {
    await modal.sampleCanvas.click(x, y);
  }
};

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

test.beforeAll(
  async ({ annotateSDK, datasetFactory, fiftyoneLoader, foWebServer }) => {
    await foWebServer.startWebServer();
    await datasetFactory.createDataset({
      datasetName,
      imageOptions: { fillColor: "white", width: 640, height: 480 },
    });
    // The factory only models Detection(s)/Classification(s); declare the
    // Polylines field directly.
    await fiftyoneLoader.executePythonCode(`
import fiftyone as fo

dataset = fo.load_dataset("${datasetName}")
dataset.add_sample_field(
    "polylines", fo.EmbeddedDocumentField, embedded_doc_type=fo.Polylines
)
dataset.add_sample_field("polylines.polylines.index", fo.IntField)
dataset.save()
`);
    await annotateSDK.updateLabelSchema(datasetName, "polylines", {
      type: "polylines",
      classes: ["lane", "curb"],
      attributes: [],
      component: "dropdown",
    });
    await annotateSDK.addFieldToActiveLabelSchema(datasetName, "polylines");
  },
);

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test.describe.serial("2D annotation polyline", () => {
  test.beforeEach(async ({ fiftyoneLoader, modal, page }) => {
    await fiftyoneLoader.executePythonCode(clearPolylines());
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
      searchParams: new URLSearchParams({ id }),
    });
    await modal.waitForSampleLoadDomAttribute();
    await modal.assert.isOpen();
    await modal.sidebar.switchMode("annotate");
  });

  test("drawing a polyline creates a labeled polyline that persists", async ({
    browser,
    fiftyoneLoader,
    modal,
    page,
  }) => {
    await modal.sidebar.annotate.polylineMode();
    await drawPolyline(modal, TRIANGLE);

    // the freshly-drawn polyline opens its edit form; assigning a class commits.
    const saved = savedSample(page);
    await modal.sidebar.edit.selectFieldChoice("label", "lane");
    await modal.sidebar.edit.assert.verifyFieldValue("label", "lane");
    await saved;

    // true round-trip: the labeled polyline is the one active label and reads
    // back its class.
    await inFreshContext(browser, fiftyoneLoader, async (freshModal) => {
      await expect
        .poll(() => freshModal.sidebar.annotate.getActiveLabelsCount())
        .toBe(1);
      await freshModal.sidebar.annotate.selectActiveLabel("lane", 0);
      await freshModal.sidebar.edit.assert.verifyFieldValue("label", "lane");
    });
  });

  test("a polyline can be deleted and the deletion is undoable", async ({
    modal,
    page,
  }) => {
    await modal.sidebar.annotate.polylineMode();
    await drawPolyline(modal, TRIANGLE);

    const saved = savedSample(page);
    await modal.sidebar.edit.selectFieldChoice("label", "lane");
    await saved;

    // exit to the list so the label is counted (the actively-edited label
    // isn't listed in the Labels group while its form is open).
    await modal.sidebar.edit.exitToList();
    await expect
      .poll(() => modal.sidebar.annotate.getActiveLabelsCount())
      .toBe(1);

    // re-select and delete it.
    await modal.sidebar.annotate.selectActiveLabel("lane", 0);
    const deleted = savedSample(page);
    await modal.sidebar.edit.deleteLabel();
    await deleted;
    await expect
      .poll(() => modal.sidebar.annotate.getActiveLabelsCount())
      .toBe(0);

    // delete is one undoable engine unit (the undo control lives in the
    // list-level actions bar, so it's reachable after the form exits).
    await modal.sidebar.edit.assert.undoIsEnabled();
    await modal.sidebar.edit.undo();
    await expect
      .poll(() => modal.sidebar.annotate.getActiveLabelsCount())
      .toBe(1);
  });
});
