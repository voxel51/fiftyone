import { test as base } from "src/oss/fixtures";
import { ModalPom } from "src/oss/poms/modal";
import { SampleCanvasType } from "src/oss/poms/modal/sample-canvas";
import { SchemaManagerPom } from "src/oss/poms/schema-manager";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix("quick-edit");

const id = "000000000000000000000000";

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

test.beforeAll(async ({ fiftyoneLoader, mediaFactory, foWebServer }) => {
  await foWebServer.startWebServer();
  await mediaFactory.createBlankImage({
    outputPath: "/tmp/blank.png",
    width: 914,
    height: 620,
    fillColor: "#ffffff",
    hideLogs: true,
  });

  await fiftyoneLoader.executePythonCode(`
  from bson import ObjectId
  import fiftyone as fo
  from datetime import datetime

  dataset = fo.Dataset("${datasetName}")
  dataset.media_type = "image"

  sample = fo.Sample(
      _id=ObjectId("${id}"),
      classification=fo.Classification(label="value"),
      detections=fo.Detections(
          detections=[
              fo.Detection(label="value", bounding_box=[0.25, 0.25, 0.5, 0.5])
          ]
      ),
      filepath="/tmp/blank.png"
  )
  dataset._sample_collection.insert_many(
      [dataset._make_dict(sample, include_id=True)]
  )

  dataset.add_sample_field(
      "classification",
      fo.EmbeddedDocumentField,
      embedded_doc_type=fo.Classification,
  )
  dataset.add_sample_field(
      "detections",
      fo.EmbeddedDocumentField,
      embedded_doc_type=fo.Detections,
  )
  dataset.save()
  sample = dataset.first()
  sample.tags = ["tag"]
  sample.save()`);
});

test.describe.serial("quick edit", () => {
  test.beforeEach(async ({ fiftyoneLoader, page }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
      searchParams: new URLSearchParams({ id }),
    });
  });

  test("classification via sidebar", async ({ modal }) => {
    // Init
    await modal.assert.isOpen();
    await modal.sampleCanvas.assert.is(SampleCanvasType.LOOKER);
    await modal.sampleCanvas.move(0.9, 0.9);
    await modal.sampleCanvas.assert.hasScreenshot(
      "classification-label-looker.png"
    );

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
    await modal.sampleCanvas.assert.hasScreenshot(
      "classification-label-lighter.png"
    );
  });

  test("detections via tooltip", async ({ modal }) => {
    // Init
    await modal.assert.isOpen();
    await modal.sampleCanvas.assert.is(SampleCanvasType.LOOKER);
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
    await modal.sampleCanvas.assert.hasScreenshot(
      "centered-bounding-box-lighter-focused.png"
    );

    // Resize box
    await modal.sampleCanvas.move(0.75, 0.75, "nwse-resize");
    await modal.sampleCanvas.down();
    await modal.sampleCanvas.move(0.5, 0.5);
    await modal.sampleCanvas.up();
    await modal.sampleCanvas.move(0.75, 0.75, "default");
    await modal.sampleCanvas.assert.hasScreenshot(
      "centered-bounding-box-lighter-focused-small.png"
    );
  });
});
