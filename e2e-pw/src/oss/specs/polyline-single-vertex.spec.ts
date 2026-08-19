/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Single-vertex polylines in Explore (FOEPD-4459):
 *   - a lone vertex is drawn as a dot and hit-tested like a keypoint, so
 *     hovering it opens the polyline tooltip (previously it neither rendered
 *     nor hit),
 *   - polyline fields offer per-attribute visibility eyes in the modal
 *     sidebar (previously gated to detections).
 */
import { expect, test as base } from "src/oss/fixtures";
import { ModalPom } from "src/oss/poms/modal";
import { SampleCanvasType } from "src/oss/poms/modal/sample-canvas";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";
import { indexToId } from "src/shared/utils";

const datasetName = getUniqueDatasetNameWithPrefix("polyline-single-vertex");

/** The factory's first sample id (index 0), used to deep-link the modal. */
const id = indexToId(0);

const test = base.extend<{ modal: ModalPom }>({
  modal: async ({ page, eventUtils }, use) => {
    await use(new ModalPom(page, eventUtils));
  },
});

// A single-vertex polyline at the media center, where container-relative and
// media-relative coordinates coincide regardless of letterboxing.
test.beforeAll(async ({ datasetFactory, foWebServer }) => {
  await foWebServer.startWebServer();
  await datasetFactory.createDataset({
    datasetName,
    imageOptions: { fillColor: "white", width: 640, height: 480 },
    schema: { polylines: "Polylines" },
    withSampleData: (_, { createId }) => ({
      polylines: {
        _cls: "Polylines",
        polylines: [
          {
            _id: createId(),
            _cls: "Polyline",
            label: "dot",
            points: [[[0.5, 0.5]]],
            closed: false,
            filled: false,
          },
        ],
      },
    }),
  });
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
  await modal.sampleCanvas.assert.is(SampleCanvasType.LOOKER);
});

test("a lone vertex renders and hovers like a keypoint", async ({ modal }) => {
  // park the cursor away from the vertex, then hover it; the cursor gate
  // retries until the dot's hit target answers
  await modal.sampleCanvas.move(0.9, 0.9);
  await modal.sampleCanvas.move(0.5, 0.5, "pointer");

  await modal.sampleCanvas.tooltip.assert.isVisible();
  await modal.sampleCanvas.tooltip.assert.hasField("polylines");
  await modal.sampleCanvas.tooltip.assert.hasAttribute("label", "dot");
});

test("polyline attributes offer visibility eyes in the modal", async ({
  modal,
}) => {
  await modal.sidebar.clickFieldDropdown("polylines");

  const labelEye = modal.sidebar.locator.getByTestId(
    "shown-attribute-polylines.polylines.label",
  );
  await expect(labelEye).toBeVisible();
  await expect(labelEye).toBeEnabled();
});
