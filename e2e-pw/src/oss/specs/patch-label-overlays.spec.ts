/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Patch label overlays (FOEPD-4259) and toggleable label attributes
 * (FOEPD-4260) in grid patches views. Each patch tile shows its label as a
 * tag bubble; the sidebar's per-attribute eye icons control which attributes
 * render in the bubble, and the last shown attribute locks so at least one
 * always renders.
 */
import { test as base, expect } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { SidebarPom } from "src/oss/poms/sidebar";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix("patch-label-overlays");

const test = base.extend<{ grid: GridPom; sidebar: SidebarPom }>({
  grid: async ({ page, eventUtils }, use) => {
    await use(new GridPom(page, eventUtils));
  },
  sidebar: async ({ page }, use) => {
    await use(new SidebarPom(page));
  },
});

test.beforeAll(async ({ datasetFactory, foWebServer }) => {
  await foWebServer.startWebServer();
  await datasetFactory.createDataset({
    datasetName,
    numSamples: 3,
    schema: {
      predictions: "Detections",
    },
    withSampleData: (_, { createId }) => ({
      predictions: {
        detections: [
          {
            _id: createId(),
            label: "cat",
            confidence: 0.9,
            bounding_box: [0.1, 0.1, 0.2, 0.2],
          },
          {
            _id: createId(),
            label: "dog",
            confidence: 0.4,
            bounding_box: [0.3, 0.3, 0.2, 0.2],
          },
        ],
      },
    }),
    savedViews: { patches: "dataset.to_patches('predictions')" },
  });
});

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test.beforeEach(async ({ fiftyoneLoader, page }) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
    searchParams: new URLSearchParams({ view: "patches" }),
  });
});

test("patch tiles show the patch label as a tag bubble", async ({ grid }) => {
  await grid.assert.isTileCountEqualTo(6);
  await grid.assert.nthSampleHasTagValue(0, "predictions", "cat");
  await grid.assert.nthSampleHasTagValue(1, "predictions", "dog");
});

test("attribute eyes control bubble text; the last shown attribute locks", async ({
  grid,
  sidebar,
}) => {
  const labelEye = sidebar.shownAttributeToggle("predictions.detections.label");
  const confidenceEye = sidebar.shownAttributeToggle(
    "predictions.detections.confidence",
  );

  await sidebar.clickFieldDropdown("predictions");

  // `label` is the only shown attribute by default, so its eye is locked
  await expect(labelEye).toBeDisabled();

  await confidenceEye.click();
  await grid.assert.nthSampleHasTagValue(0, "predictions", "cat, 0.9");
  await expect(labelEye).toBeEnabled();

  await labelEye.click();
  await grid.assert.nthSampleHasTagValue(0, "predictions", "0.9");
  await expect(confidenceEye).toBeDisabled();
});
