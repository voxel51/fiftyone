/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * 2D mask lifecycle without a brush, for both an embedded numpy `mask` and an
 * on-disk `mask_path`: selecting a masked detection enters segmentation mode,
 * and removing the mask is one autosave patch that undoes/redoes and persists.
 * Mask presence is read off the label menu ("Remove mask" vs "Add mask"), and
 * seeded detections carry `_cls` so the embedded mask decodes.
 */
import fs from "node:fs";
import { Browser, expect, test as base } from "src/oss/fixtures";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";
import { EventUtils } from "src/shared/event-utils";
import type { AbstractFiftyoneLoader } from "src/shared/abstract-loader";
import type { DatasetFactory } from "src/shared/dataset-factory";

/** Fixed ObjectId addressing the single sample (so we can deep-link the modal). */
const id = "000000000000000000000000";

const isSamplePatch = (method: string) =>
  ["POST", "PATCH", "PUT"].includes(method);

/** Shared on-disk instance mask (a white PNG = full mask) for the mask_path case. */
const sharedMaskPath = `/tmp/annotate-2d-mask-${process.pid}-mask.png`;

interface MaskKind {
  kind: "mask" | "mask_path";
  datasetName: string;
}

const KINDS: MaskKind[] = [
  {
    kind: "mask",
    datasetName: getUniqueDatasetNameWithPrefix("annotate-2d-mask-embedded"),
  },
  {
    kind: "mask_path",
    datasetName: getUniqueDatasetNameWithPrefix("annotate-2d-mask-path"),
  },
];

/** (Re)create the single-sample dataset with a "cat" detection masked by `kind`. */
const createMaskDataset = (
  datasetFactory: typeof DatasetFactory,
  { kind, datasetName }: MaskKind,
) =>
  datasetFactory.createDataset({
    datasetName,
    imageOptions: { fillColor: "white", width: 640, height: 480 },
    schema: { detections: "Detections" },
    labelSchemas: {
      detections: {
        type: "detections",
        classes: ["cat", "dog"],
        attributes: [],
        component: "dropdown",
      },
    },
    withSampleData: (_, { createId, mask }) => ({
      detections: {
        _cls: "Detections",
        detections: [
          {
            _id: createId(),
            _cls: "Detection",
            tags: [],
            label: "cat",
            bounding_box: [0.4, 0.4, 0.2, 0.2],
            ...(kind === "mask"
              ? { mask: mask(50, 50) }
              : { mask_path: sharedMaskPath }),
          },
        ],
      },
    }),
  });

const test = base.extend<{ modal: ModalPom }>({
  modal: async ({ page, eventUtils }, use) => {
    await use(new ModalPom(page, eventUtils));
  },
});

test.beforeAll(async ({ foWebServer, mediaFactory }) => {
  await foWebServer.startWebServer();

  // A solid-white PNG → a full instance mask (every pixel in-mask).
  await mediaFactory.createImage({
    outputPath: sharedMaskPath,
    width: 64,
    height: 64,
    fillColor: "white",
    hideLogs: true,
  });
});

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
  try {
    fs.rmSync(sharedMaskPath, { force: true });
  } catch (error) {
    void error;
  }
});

/**
 * Open the dataset in a fresh browser context (true server round-trip) and run
 * `verify` against an annotate-mode modal there.
 */
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

for (const cfg of KINDS) {
  test.describe.serial(`2D annotation mask (${cfg.kind})`, () => {
    // Re-seed before each test so a prior test's persisted removal doesn't bleed
    // in — every test starts mask-present and independent.
    test.beforeEach(async ({ datasetFactory, fiftyoneLoader, modal, page }) => {
      await createMaskDataset(datasetFactory, cfg);
      await fiftyoneLoader.waitUntilGridVisible(page, cfg.datasetName, {
        searchParams: new URLSearchParams({ id }),
      });
      await modal.waitForSampleLoadDomAttribute();
      await modal.assert.isOpen();
      await modal.sidebar.switchMode("annotate");
    });

    test("selecting a masked detection enters segmentation mode", async ({
      modal,
    }) => {
      await modal.sidebar.edit.assert.inSegmentationMode(false);
      await modal.sidebar.annotate.selectActiveLabel("cat", 0);
      await modal.sidebar.edit.assert.hasMask(true);
      await modal.sidebar.edit.assert.inSegmentationMode(true);
    });

    test("removing the mask drops it in one patch and is undoable", async ({
      modal,
      page,
    }) => {
      await modal.sidebar.annotate.selectActiveLabel("cat", 0);
      await modal.sidebar.edit.assert.hasMask(true);

      // Clean baseline (selection doesn't dirty): the removal's commit should be
      // the only patch on the wire.
      let patches = 0;
      const countPatch = (r: {
        url(): string;
        request(): { method(): string };
      }) => {
        if (/\/sample\//.test(r.url()) && isSamplePatch(r.request().method())) {
          patches += 1;
        }
      };
      page.on("response", countPatch);

      try {
        const saved = page.waitForResponse(
          (r) =>
            /\/sample\//.test(r.url()) && isSamplePatch(r.request().method()),
        );
        await modal.sidebar.edit.removeMask();
        await saved;

        await modal.sidebar.edit.assert.hasMask(false);
        expect(patches).toBe(1);
      } finally {
        page.off("response", countPatch);
      }

      // Undo restores the mask; redo removes it again (engine value-based stack).
      await modal.sidebar.edit.assert.undoIsEnabled();
      await modal.sidebar.edit.undo();
      await modal.sidebar.edit.assert.hasMask(true);

      await modal.sidebar.edit.assert.redoIsEnabled();
      await modal.sidebar.edit.redo();
      await modal.sidebar.edit.assert.hasMask(false);
    });

    test("a mask removal persists across a fresh load", async ({
      browser,
      fiftyoneLoader,
      modal,
      page,
    }) => {
      await modal.sidebar.annotate.selectActiveLabel("cat", 0);
      await modal.sidebar.edit.assert.hasMask(true);

      const saved = page.waitForResponse(
        (r) =>
          /\/sample\//.test(r.url()) && isSamplePatch(r.request().method()),
      );
      await modal.sidebar.edit.removeMask();
      await saved;
      await modal.sidebar.edit.assert.hasMask(false);

      await inFreshContext(
        browser,
        fiftyoneLoader,
        cfg.datasetName,
        async (freshModal) => {
          await freshModal.sidebar.annotate.selectActiveLabel("cat", 0);
          await freshModal.sidebar.edit.assert.hasMask(false);
        },
      );
    });
  });
}
