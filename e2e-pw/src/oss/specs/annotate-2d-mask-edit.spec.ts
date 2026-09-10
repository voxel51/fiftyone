/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Editing an EXISTING 2D segmentation mask with the brush tool. The covered
 * mask specs only create-from-scratch and full-remove; this exercises the
 * incremental brush strokes on an already-painted mask:
 *   - an "Add" stroke that extends beyond the mask grows the pixel count and
 *     persists,
 *   - a "Remove" stroke erases pixels and is undoable on the engine stack.
 *
 * Mask state is verified in a fresh browser context — a true server
 * round-trip. The Add stroke grows the masked region beyond the seed bbox, so
 * the persisted bounding box widening is the grow signal there. The Remove
 * stroke is asserted on COVERAGE FRACTION (`maskCoverage`), NOT raw pixels: the
 * mask is re-rasterized to the overlay's pixel resolution on commit (e.g. 50×50
 * → ~124×165), so the raw count rises even when the painted area shrinks — only
 * the coverage fraction reflects the erase.
 *
 * The seeded detection carries `_cls`: the server's mask encoder only converts
 * an embedded numpy `mask` to the zlib-base64 the app decodes when the label's
 * `_cls` is a mask class (see annotate-2d-mask).
 */
import { Browser, expect, test as base } from "src/oss/fixtures";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";
import { EventUtils } from "src/shared/event-utils";
import type { AbstractFiftyoneLoader } from "src/shared/abstract-loader";

const datasetName = getUniqueDatasetNameWithPrefix("annotate-2d-mask-edit");

/** Fixed ObjectId addressing the single sample (so we can deep-link the modal). */
const id = "000000000000000000000000";

/** The rendered mask preview's covered fraction once the mask has decoded. */
const maskCoverage = async (modal: ModalPom) => {
  await expect
    .poll(() => modal.sidebar.edit.maskPreviewCoverage())
    .toBeGreaterThan(0);
  return modal.sidebar.edit.maskPreviewCoverage();
};

/** Open the seeded detection's editor in a brand-new browser context. */
const inFreshContext = async (
  browser: Browser,
  fiftyoneLoader: AbstractFiftyoneLoader,
  verify: (modal: ModalPom) => Promise<void>,
) => {
  const context = await browser.newContext();
  const freshPage = await context.newPage();
  try {
    const freshModal = new ModalPom(freshPage, new EventUtils(freshPage));
    await fiftyoneLoader.waitUntilGridVisible(freshPage, datasetName, {
      searchParams: new URLSearchParams({ id }),
    });
    await freshModal.waitForSampleLoadDomAttribute();
    await freshModal.assert.isOpen();
    await freshModal.sidebar.switchMode("annotate");
    await freshModal.sidebar.annotate.selectActiveLabel("cat", 0);
    await verify(freshModal);
  } finally {
    await context.close();
  }
};

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

test.describe.serial("2D annotation mask edit (brush)", () => {
  test.beforeEach(async ({ datasetFactory, fiftyoneLoader, modal, page }) => {
    // a fresh masked detection per test (serial, shared dataset name)
    await datasetFactory.createDataset({
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
      // a masked "cat" detection at a small bbox, mask fully set within the box
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
              mask: mask(50, 50),
            },
          ],
        },
      }),
    });
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
      searchParams: new URLSearchParams({ id }),
    });
    await modal.waitForSampleLoadDomAttribute();
    await modal.assert.isOpen();
    await modal.sidebar.switchMode("annotate");
  });

  test("an Add brush stroke grows the mask and persists", async ({
    browser,
    fiftyoneLoader,
    modal,
  }) => {
    await modal.sidebar.annotate.selectActiveLabel("cat", 0);
    await modal.sidebar.edit.assert.inSegmentationMode(true);

    const before = Number(
      await modal.sidebar.edit.getFieldValue("dimensions.width"),
    );
    expect(before).toBeGreaterThan(0);

    await modal.sidebar.annotate.pickTool("Brush");
    await modal.sidebar.annotate.pickMaskMode("Add");

    // paint a stroke well outside the seeded bbox ([0.4,0.4]+0.2) so the mask
    // grows rather than re-covering already-set pixels.
    const saved = modal.sidebar.annotate.waitForPatch();
    await modal.sampleCanvas.drag(0.7, 0.5, 0.85, 0.5);
    await saved;

    // the persisted mask reaches past the seeded box: its bounding box widened
    await inFreshContext(browser, fiftyoneLoader, async (fresh) => {
      await fresh.sidebar.edit.assert.hasMaskPreview();
      expect(
        Number(await fresh.sidebar.edit.getFieldValue("dimensions.width")),
      ).toBeGreaterThan(before);
    });
  });

  test("a Remove brush stroke erases pixels and is undoable", async ({
    browser,
    fiftyoneLoader,
    modal,
  }) => {
    await modal.sidebar.annotate.selectActiveLabel("cat", 0);
    await modal.sidebar.edit.assert.inSegmentationMode(true);

    // seed mask is fully set within its bbox → coverage starts at 1.0.
    const before = await maskCoverage(modal);
    expect(before).toBeGreaterThan(0);

    await modal.sidebar.annotate.pickTool("Brush");
    await modal.sidebar.annotate.pickMaskMode("Remove");

    // erase across the seeded bbox center.
    const saved = modal.sidebar.annotate.waitForPatch();
    await modal.sampleCanvas.drag(0.42, 0.5, 0.58, 0.5);
    await saved;

    // coverage drops — raw pixel count is unreliable across the commit's mask
    // re-rasterization, the covered FRACTION is not.
    await inFreshContext(browser, fiftyoneLoader, async (fresh) => {
      expect(await maskCoverage(fresh)).toBeLessThan(before);
    });

    // the erase is one undoable engine unit — undo restores full coverage.
    await modal.sidebar.edit.assert.undoIsEnabled();
    const restored = modal.sidebar.annotate.waitForPatch();
    await modal.sidebar.edit.undo();
    await restored;

    await inFreshContext(browser, fiftyoneLoader, async (fresh) => {
      expect(await maskCoverage(fresh)).toBe(before);
    });
  });
});
