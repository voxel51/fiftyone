/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Single-vertex polylines in Annotate (FOEPD-4459):
 *   - the seed vertex persists on the first click (previously the label lived
 *     only in the sidebar draft — no engine row, no document write — until a
 *     second vertex landed, so the reload read-back below found nothing),
 *   - Backspace with the lone vertex sub-selected deletes the whole label
 *     (previously it deferred to vertex removal and appeared to do nothing).
 *
 * Each test draws on its own sample, so a failed test cannot leak a stray
 * polyline into another.
 */
import { test as base, type Page } from "src/oss/fixtures";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";
import type { AbstractFiftyoneLoader } from "src/shared/abstract-loader";
import { indexToId } from "src/shared/utils";

const datasetName = getUniqueDatasetNameWithPrefix(
  "annotate-2d-polyline-single-vertex",
);

/** One sample per test, deep-linked by the factory's fixed ids. */
const SAMPLE_IDS = {
  persist: indexToId(0),
  delete: indexToId(1),
};

/** The single vertex, at the media center. */
const VERTEX: [number, number] = [0.5, 0.5];

const test = base.extend<{ modal: ModalPom }>({
  modal: async ({ page, eventUtils }, use) => {
    await use(new ModalPom(page, eventUtils));
  },
});

test.beforeAll(async ({ datasetFactory, foWebServer }) => {
  await foWebServer.startWebServer();
  await datasetFactory.createDataset({
    datasetName,
    numSamples: Object.keys(SAMPLE_IDS).length,
    imageOptions: { fillColor: "white", width: 640, height: 480 },
    schema: {
      polylines: "Polylines",
      // the annotate flow stamps an `index` on drawn polylines
      "polylines.polylines.index": "IntField",
    },
    labelSchemas: {
      polylines: {
        type: "polylines",
        classes: ["lane", "curb"],
        attributes: [],
        component: "dropdown",
      },
    },
  });
});

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

/** Open the sample's modal in annotate mode. */
const openSample = async (
  fiftyoneLoader: AbstractFiftyoneLoader,
  page: Page,
  modal: ModalPom,
  id: string,
) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
    searchParams: new URLSearchParams({ id }),
  });
  await modal.waitForSampleLoadDomAttribute();
  await modal.assert.isOpen();
  await modal.sidebar.switchMode("annotate");
};

/**
 * Re-open the sample after the first `openSample`: the annotate-mode choice
 * persists across navigation, so the modal boots straight into Annotate and
 * the Explore looker canvas (whose `canvas-loaded` attribute `openSample`
 * waits on) never mounts — wait on the lighter surface instead.
 */
const reopenSample = async (
  fiftyoneLoader: AbstractFiftyoneLoader,
  page: Page,
  modal: ModalPom,
  id: string,
) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
    searchParams: new URLSearchParams({ id }),
  });
  await modal.waitForLighterReady();
  await modal.assert.isOpen();
};

/** Draw the single-vertex polyline and class it `lane`. */
const drawAndClass = async (modal: ModalPom) => {
  await modal.sidebar.annotate.polylineMode();
  // the toolbar toggle installs the creation handler via an effect, so gate
  // the click on its crosshair — with exactly one click, a swallowed click
  // has no later vertex to self-heal on
  await modal.sampleCanvas.move(...VERTEX, "crosshair");
  await modal.sampleCanvas.click(...VERTEX);
  await modal.sidebar.edit.selectFieldChoice("label", "lane");
  await modal.sidebar.edit.assert.verifyFieldValue("label", "lane");
};

test("a single vertex persists on the first click", async ({
  fiftyoneLoader,
  modal,
  page,
}) => {
  await openSample(fiftyoneLoader, page, modal, SAMPLE_IDS.persist);
  await drawAndClass(modal);
  await modal.sidebar.annotate.waitForSavesSettled();

  // true round-trip: re-navigating reloads the page, so the app rebuilds from
  // the server and the one-vertex label reads back. Pre-fix there was no
  // engine row to save, so this reload found nothing.
  await reopenSample(fiftyoneLoader, page, modal, SAMPLE_IDS.persist);
  await modal.sidebar.annotate.assert.hasActiveLabelsCount(1);
  await modal.sidebar.annotate.selectActiveLabel("lane", 0);
  await modal.sidebar.edit.assert.verifyFieldValue("label", "lane");
});

test("Backspace on the lone vertex deletes the label", async ({
  fiftyoneLoader,
  modal,
  page,
}) => {
  await openSample(fiftyoneLoader, page, modal, SAMPLE_IDS.delete);
  await drawAndClass(modal);
  await modal.sidebar.annotate.waitForSavesSettled();

  // clicking the vertex is a point hit — it sub-selects the lone point, the
  // exact state where Backspace previously deferred to vertex removal. The
  // sub-selection is set synchronously in the overlay's pointer handler, so
  // the keydown that follows always observes it.
  await modal.sampleCanvas.click(...VERTEX);
  await page.keyboard.press("Backspace");

  await modal.sidebar.annotate.assert.hasActiveLabelsCount(0);
  // the delete flushes before the test ends
  await modal.sidebar.annotate.waitForSavesSettled();
});
