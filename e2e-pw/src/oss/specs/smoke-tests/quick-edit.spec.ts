import { test as base } from "src/oss/fixtures";
import { ModalPom } from "src/oss/poms/modal";
import { Box, SampleCanvasType } from "src/oss/poms/modal/sample-canvas";
import { SchemaManagerPom } from "src/oss/poms/schema-manager";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix("quick-edit");
const id = "000000000000000000000000";
const imageWidth = 914;
const imageHeight = 620;
const initialBoundingBox = { x: 0.25, y: 0.25, width: 0.5, height: 0.5 };
const detectionTestPoints = (({ x, y, width, height }: Box) => {
  return [
    {
      name: "top-left",
      cursor: "nwse",
      x,
      y,
      resize: { x: 0.5, y: 0.5, width: 0.25, height: 0.25 },
      move: { x: 0, y: 0, height, width },
    },
    {
      name: "top",
      cursor: "ns",
      x: x + width / 2,
      y,
      resize: { x: 0.25, y: 0.5, width: 0.5, height: 0.25 },
      move: { x: 0.25, y: 0, height, width },
    },
    {
      name: "top-right",
      cursor: "nesw",
      x: x + width,
      y,
      resize: { x: 0.25, y: 0.5, width: 0.25, height: 0.25 },
      move: { x: 0.5, y: 0, height, width },
    },
    {
      name: "right",
      cursor: "ew",
      x: x + width,
      y: y + height / 2,
      resize: { x: 0.25, y: 0.25, width: 0.25, height: 0.5 },
      move: { x: 0.5, y: 0.25, height, width },
    },
    {
      name: "bottom-right",
      cursor: "nwse",
      x: x + width,
      y: y + height,
      resize: { x: 0.25, y: 0.25, width: 0.25, height: 0.25 },
      move: { x: 0.5, y: 0.5, height, width },
    },
    {
      name: "bottom",
      cursor: "ns",
      x: x + width / 2,
      y: y + height,
      resize: { x: 0.25, y: 0.25, width: 0.5, height: 0.25 },
      move: { x: 0.25, y: 0.5, height, width },
    },
    {
      name: "bottom-left",
      cursor: "nesw",
      x,
      y: y + height,
      resize: { x: 0.5, y: 0.25, width: 0.25, height: 0.25 },
      move: { x: 0, y: 0.5, height, width },
    },
    {
      name: "left",
      cursor: "ew",
      x,
      y: y + height / 2,
      resize: { x: 0.5, y: 0.25, width: 0.25, height: 0.5 },
      move: { x: 0, y: 0.25, height, width },
    },
  ];
})(initialBoundingBox);

const test = base.extend<{
  modal: ModalPom;
  schemaManager: SchemaManagerPom;
}>({
  modal: async ({ page, eventUtils }, use) => {
    await use(new ModalPom(page, eventUtils));
  },
});

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test.beforeAll(async ({ datasetFactory, foWebServer }) => {
  await foWebServer.startWebServer();
  await datasetFactory.createBlankDataset({
    datasetName,
    imageOptions: {
      fillColor: "white",
      height: imageHeight,
      width: imageWidth,
    },
    schema: {
      classification: "Classification",
      detections: "Detections",
    },
    withSampleData: (_, { createId }) => ({
      classification: { _id: createId(), label: "value" },
      detections: {
        detections: [
          {
            _id: createId(),
            label: "value",
            bounding_box: [0.25, 0.25, 0.5, 0.5],
          },
        ],
      },
    }),
  });
});

test.describe.serial("quick edit", () => {
  test.beforeEach(async ({ fiftyoneLoader, modal, page }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
      searchParams: new URLSearchParams({ id }),
    });

    await modal.waitForSampleLoadDomAttribute();
    await modal.assert.isOpen();
    await modal.sampleCanvas.assert.is(SampleCanvasType.LOOKER);
  });

  test("classification via sidebar", async ({ modal }) => {
    // Init
    await modal.sampleCanvas.move(0.9, 0.9);
    await modal.sampleCanvas.assert.hasScreenshot("classification-looker.png");

    // Show tooltip
    await modal.sampleCanvas.move(0.05, 0.03, "pointer");
    await modal.sampleCanvas.tooltip.assert.isVisible();
    await modal.sampleCanvas.tooltip.assert.isLocked(false);

    // Assert tooltip content
    await modal.sampleCanvas.tooltip.assert.hasField("classification");
    await modal.sampleCanvas.tooltip.assert.hasAttribute(
      "label",
      "value",
      false
    );

    // Transition to quick edit via the sidebar
    await modal.sidebar.quickEdit("classification");
    await modal.sampleCanvas.assert.is(SampleCanvasType.LIGHTER);
    await modal.sampleCanvas.assert.hasScreenshot("classification-lighter.png");
  });

  test("detections via tooltip", async ({ modal, page }) => {
    // Init
    await modal.sampleCanvas.move(0.9, 0.9);
    await modal.sampleCanvas.assert.hasCursor("default");

    // Show tooltip
    await modal.sampleCanvas.move(0.5, 0.5, "pointer");
    await modal.sampleCanvas.tooltip.assert.isVisible();
    await modal.sampleCanvas.tooltip.assert.isLocked(false);

    // Lock tooltip
    await modal.sampleCanvas.tooltip.toggleLock();
    await modal.sampleCanvas.tooltip.assert.isLocked();

    // Assert tooltip content
    await modal.sampleCanvas.tooltip.assert.hasField("detections");
    await modal.sampleCanvas.tooltip.assert.hasAttribute(
      "label",
      "value",
      false
    );

    // Transition to quick edit via the tooltip
    await modal.sampleCanvas.tooltip.quickEdit();
    await modal.sampleCanvas.assert.is(SampleCanvasType.LIGHTER);
    await modal.sampleCanvas.move(0.9, 0.9, "default");
    await modal.sidebar.edit.assert.redoIsEnabled(false);
    await modal.sidebar.edit.assert.undoIsEnabled(false);

    await modal.sampleCanvas.assert.hasScreenshot(
      "detection-lighter-selected-centered.png"
    );

    const assertPosition = async function ({ x, y, width, height }: Box) {
      await modal.sidebar.edit.assert.verifyFieldValue(
        "position.x",
        (x * imageWidth).toString()
      );
      await modal.sidebar.edit.assert.verifyFieldValue(
        "position.y",
        (y * imageHeight).toString()
      );
      await modal.sidebar.edit.assert.verifyFieldValue(
        "dimensions.width",
        (width * imageWidth).toString()
      );
      await modal.sidebar.edit.assert.verifyFieldValue(
        "dimensions.height",
        (height * imageHeight).toString()
      );
    };

    for (const point of detectionTestPoints) {
      // Resize box
      await modal.sampleCanvas.move(point.x, point.y, `${point.cursor}-resize`);
      await modal.sampleCanvas.down();
      await modal.sampleCanvas.move(0.5, 0.5);
      await modal.sampleCanvas.up();
      await modal.sampleCanvas.move(point.x, point.y, "default");
      await modal.sidebar.edit.assert.undoIsEnabled();
      await modal.sampleCanvas.assert.hasScreenshot(
        `detection-lighter-selected-${point.name}.png`
      );
      await assertPosition(point.resize);

      // Undo
      await modal.sidebar.edit.undo();
      await modal.sidebar.edit.assert.redoIsEnabled();
      await modal.sampleCanvas.assert.hasScreenshot(
        "detection-lighter-selected-centered.png"
      );
      await assertPosition(initialBoundingBox);

      // Redo
      await modal.sidebar.edit.redo();
      await modal.sidebar.edit.assert.redoIsEnabled(false);
      await modal.sidebar.edit.assert.undoIsEnabled();
      await modal.sampleCanvas.assert.hasScreenshot(
        `detection-lighter-selected-${point.name}.png`
      );
      await assertPosition(point.resize);

      // Resize to original box
      await modal.sampleCanvas.move(0.5, 0.5, `${point.cursor}-resize`);
      await modal.sampleCanvas.down();
      await modal.sampleCanvas.move(point.x, point.y);
      await modal.sampleCanvas.up();
      await modal.sampleCanvas.move(0.9, 0.9, "default");
      await modal.sampleCanvas.assert.hasScreenshot(
        "detection-lighter-selected-centered.png"
      );
      await assertPosition(initialBoundingBox);
    }

    for (const point of detectionTestPoints) {
      // Move box
      await modal.sampleCanvas.move(0.5, 0.5);
      await modal.sampleCanvas.down();
      await modal.sampleCanvas.move(point.x, point.y);
      await modal.sampleCanvas.up();
      await modal.sidebar.edit.assert.undoIsEnabled();
      await modal.sampleCanvas.assert.hasScreenshot(
        `detection-lighter-selected-${point.name}-move.png`
      );
      await assertPosition(point.move);

      // Undo
      await modal.sidebar.edit.undo();
      await modal.sidebar.edit.assert.redoIsEnabled();
      await modal.sampleCanvas.assert.hasScreenshot(
        "detection-lighter-selected-centered.png"
      );
      await assertPosition(initialBoundingBox);

      // Redo
      await modal.sidebar.edit.redo();
      await modal.sidebar.edit.assert.redoIsEnabled(false);
      await modal.sidebar.edit.assert.undoIsEnabled();
      await modal.sampleCanvas.assert.hasScreenshot(
        `detection-lighter-selected-${point.name}-move.png`
      );
      await assertPosition(point.move);

      // Move back
      await modal.sampleCanvas.move(point.x, point.y);
      await modal.sampleCanvas.down();
      await modal.sampleCanvas.move(0.5, 0.5);
      await modal.sampleCanvas.up();
      await modal.sidebar.edit.assert.undoIsEnabled();
      await modal.sampleCanvas.assert.hasScreenshot(
        "detection-lighter-selected-centered.png"
      );
      await assertPosition(initialBoundingBox);
    }

    await modal.sidebar.edit.setFieldValue("confidence", "1.0");
    await modal.sampleCanvas.move(0.9, 0.9);
    await modal.sampleCanvas.assert.hasScreenshot(
      "detection-lighter-selected-centered-confidence-1.0.png"
    );

    await modal.sampleCanvas.move(0.5, 0.5, "grab");
    await modal.sampleCanvas.click(0.9, 0.9);
    await modal.sampleCanvas.move(0.9, 0.9, "default");
    await modal.sampleCanvas.assert.hasScreenshot(
      "detection-lighter-centered-confidence-1.0.png"
    );
  });
});
