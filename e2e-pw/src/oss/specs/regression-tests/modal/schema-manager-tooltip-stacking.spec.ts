import { test as base } from "src/oss/fixtures";
import { ModalPom } from "src/oss/poms/modal";
import { SchemaManagerPom } from "src/oss/poms/schema-manager";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix("tooltip-stacking");
const id = "000000000000000000000000";

const test = base.extend<{
  modal: ModalPom;
  schemaManager: SchemaManagerPom;
}>({
  modal: async ({ page, eventUtils }, use) => {
    await use(new ModalPom(page, eventUtils));
  },
  schemaManager: async ({ page, eventUtils }, use) => {
    await use(new SchemaManagerPom(page, eventUtils));
  },
});

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test.beforeAll(async ({ fiftyoneLoader, mediaFactory, foWebServer }) => {
  await foWebServer.startWebServer();
  await mediaFactory.createBlankImage({
    outputPath: "/tmp/tooltip-stacking.png",
    width: 640,
    height: 480,
    fillColor: "#ffffff",
    hideLogs: true,
  });

  await fiftyoneLoader.executePythonCode(`
  from bson import ObjectId
  import fiftyone as fo

  dataset = fo.Dataset("${datasetName}")
  dataset.media_type = "image"

  sample = fo.Sample(
      _id=ObjectId("${id}"),
      detections=fo.Detections(
          detections=[
              fo.Detection(label="cat", bounding_box=[0, 0, 1, 1]),
          ]
      ),
      filepath="/tmp/tooltip-stacking.png"
  )
  dataset._sample_collection.insert_many(
      [dataset._make_dict(sample, include_id=True)]
  )

  dataset.add_sample_field(
      "detections",
      fo.EmbeddedDocumentField,
      embedded_doc_type=fo.Detections,
  )
  dataset.save()
  sample = dataset.first()
  sample.save()`);
});

test.describe.serial("schema manager tooltip z-index stacking", () => {
  test.beforeEach(async ({ fiftyoneLoader, page }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
      searchParams: new URLSearchParams({ id }),
    });
  });

  test("tooltip does not appear above schema manager modal", async ({
    modal,
    schemaManager,
  }) => {
    await modal.assert.isOpen();
    await modal.waitForSampleLoadDomAttribute();

    // Hover over the detection at the center to trigger the tooltip
    await modal.sampleCanvas.move(0.5, 0.5);
    await modal.sampleCanvas.tooltip.assert.isVisible();

    // Lock the tooltip so it persists when we navigate away
    await modal.sampleCanvas.tooltip.toggleLock();
    await modal.sampleCanvas.tooltip.assert.isLocked();

    // Switch to annotate mode and open schema manager
    await modal.sidebar.switchMode("annotate");
    await schemaManager.open();
    await schemaManager.assert.isOpen();

    // REGRESSION TEST: Verify the schema manager modal is visually above the tooltip
    await modal.sampleCanvas.tooltip.assert.isBehindSchemaManager();
  });
});
