import { test as base } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { SchemaManagerPom } from "src/oss/poms/schema-manager";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix("image-classification");
const videoDatasetName = getUniqueDatasetNameWithPrefix("video-dataset");
const detectionDatasetName =
  getUniqueDatasetNameWithPrefix("detection-dataset");
const groupVideoDatasetName = getUniqueDatasetNameWithPrefix(
  "group-video-dataset"
);

const id = "000000000000000000000000";
const videoId = "000000000000000000000001";
const groupVideoId = "000000000000000000000003";

const test = base.extend<{
  grid: GridPom;
  modal: ModalPom;
  schemaManager: SchemaManagerPom;
}>({
  grid: async ({ page, eventUtils }, use) => {
    await use(new GridPom(page, eventUtils));
  },
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
    outputPath: "/tmp/blank.png",
    width: 50,
    height: 50,
    fillColor: "#ffffff",
    hideLogs: true,
  });

  await fiftyoneLoader.executePythonCode(`
  from bson import ObjectId
  import fiftyone as fo

  dataset = fo.Dataset("${datasetName}")

  sample = fo.Sample(
      _id=ObjectId("${id}"),
      classification=fo.Classification(label="value"),
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
  dataset.save()`);

  await fiftyoneLoader.executePythonCode(`
  import fiftyone as fo

  dataset = fo.Dataset("${detectionDatasetName}")
  sample = fo.Sample(
      filepath="/tmp/blank.png",
      predictions=fo.Detections(detections=[
          fo.Detection(label="cat", bounding_box=[0.1, 0.1, 0.2, 0.2]),
          fo.Detection(label="dog", bounding_box=[0.3, 0.3, 0.2, 0.2]),
      ])
  )
  dataset.add_samples([sample])

  # Save patches view for testing annotation disabled on generated views
  patches = dataset.to_patches("predictions")
  dataset.save_view("patches", patches)`);

  await mediaFactory.createBlankVideo({
    outputPath: "/tmp/blank-video.webm",
    duration: 1,
    width: 50,
    height: 50,
    frameRate: 5,
    color: "#000000",
  });

  await fiftyoneLoader.executePythonCode(`
  from bson import ObjectId
  import fiftyone as fo

  dataset = fo.Dataset("${videoDatasetName}")
  dataset.media_type = "video"
  sample = fo.Sample(
      _id=ObjectId("${videoId}"),
      filepath="/tmp/blank-video.webm"
  )
  # Use internal API to preserve the explicit ObjectId needed
  # for the beforeEach URL navigation (?id=...) to open the modal
  dataset._sample_collection.insert_many(
      [dataset._make_dict(sample, include_id=True)]
  )
  dataset.save()`);

  await fiftyoneLoader.executePythonCode(`
  from bson import ObjectId
  import fiftyone as fo

  dataset = fo.Dataset("${groupVideoDatasetName}")
  dataset.add_group_field("group", default="video1")
  group = fo.Group()
  sample = fo.Sample(
      _id=ObjectId("${groupVideoId}"),
      filepath="/tmp/blank-video.webm",
      group=group.element("video1")
  )
  dataset.add_samples([sample])`);
});

const DEFAULT_LABEL_SCHEMA = {
  attributes: [
    { name: "confidence", type: "float", component: "text" },
    { name: "id", type: "id", component: "text", read_only: true },
    { name: "tags", type: "list<str>", component: "text" },
  ],
  component: "text",
  type: "classification",
};

test.describe.serial("schema manager", () => {
  test("JSON view configuration", async ({
    fiftyoneLoader,
    page,
    modal,
    schemaManager,
  }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
      searchParams: new URLSearchParams({ id }),
    });
    // Init
    await modal.assert.isOpen();
    await modal.sidebar.switchMode("annotate");
    await schemaManager.open();
    await schemaManager.assert.isOpen();

    // Configure
    const row = schemaManager.getFieldRow("classification");
    // on initial click is setup, later it's edit()
    const jsonEditor = await row.scan();
    await jsonEditor.switchToJSONTab();
    await jsonEditor.assert.hasJSON(DEFAULT_LABEL_SCHEMA);

    // Unsuccessful validation
    const invalid = jsonEditor.waitForInvalidJSON();
    await jsonEditor.setJSON({
      component: "wrong",
      type: "classification",
    });
    await invalid;
    await jsonEditor.assert.hasErrors([
      "invalid component 'wrong' for field 'classification'",
    ]);

    // Discard
    await jsonEditor.discard();
    await jsonEditor.assert.hasJSON(DEFAULT_LABEL_SCHEMA);

    // Successful validation
    const valid = jsonEditor.waitForValidJSON();
    await jsonEditor.setJSON({
      component: "text",
      type: "classification",
    });
    await valid;

    // Scan
    await jsonEditor.scan();
    await jsonEditor.assert.hasJSON({
      ...DEFAULT_LABEL_SCHEMA,
      component: "radio",
      classes: ["value"],
    });

    // Save (automatically navigates back to field list)
    await jsonEditor.save();

    // Activate
    await row.assert.hasCheckbox();
    await row.clickCheckbox();
    await row.assert.isChecked(true);
    await schemaManager.moveFields();
    await schemaManager.assert.hasActiveFieldRows([
      { name: "classification", type: "Classification" },
    ]);

    // Hide
    await row.clickCheckbox();
    await row.assert.isChecked(true);
    await schemaManager.moveFields();
    await schemaManager.assert.hasHiddenFieldRows([
      { name: "classification", type: "Classification" },
    ]);

    // Close
    await schemaManager.close();
    await schemaManager.assert.isClosed();
  });

  test("schema state resets when switching to video dataset", async ({
    fiftyoneLoader,
    page,
    modal,
    schemaManager,
  }) => {
    // Start on image dataset - annotate tab should be functional
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
      searchParams: new URLSearchParams({ id }),
    });
    await modal.assert.isOpen();
    await modal.sidebar.switchMode("annotate");
    await schemaManager.assert.isEnabled();

    // Switch to video dataset
    await modal.close();
    await fiftyoneLoader.waitUntilGridVisible(page, videoDatasetName, {
      searchParams: new URLSearchParams({ id: videoId }),
    });
    await modal.assert.isOpen();
    await modal.sidebar.switchMode("annotate");

    // Annotation should be disabled for video datasets
    await modal.sidebar.assert.hasDisabledMessage(
      "isn\u2019t supported for video datasets"
    );
    await schemaManager.assert.isDisabled();
  });

  test("annotation disabled for patches view", async ({
    fiftyoneLoader,
    page,
    grid,
    modal,
    schemaManager,
  }) => {
    // Start on detection dataset - annotation should be enabled
    await fiftyoneLoader.waitUntilGridVisible(page, detectionDatasetName);
    await grid.openFirstSample();
    await modal.assert.isOpen();
    await modal.sidebar.switchMode("annotate");
    await schemaManager.assert.isEnabled();

    // Switch to patches view
    await modal.close();
    await fiftyoneLoader.waitUntilGridVisible(page, detectionDatasetName, {
      searchParams: new URLSearchParams({ view: "patches" }),
    });

    // Open first sample in the patches grid
    await grid.openFirstSample();
    await modal.assert.isOpen();
    await modal.sidebar.switchMode("annotate");

    // Annotation should be disabled for generated views
    await modal.sidebar.assert.hasDisabledMessage(
      "isn\u2019t supported for patches, frames, clips"
    );
    await schemaManager.assert.isDisabled();
  });

  test("annotation disabled for grouped dataset with no supported slices", async ({
    fiftyoneLoader,
    page,
    modal,
    schemaManager,
  }) => {
    // Navigate to grouped video dataset
    await fiftyoneLoader.waitUntilGridVisible(page, groupVideoDatasetName, {
      searchParams: new URLSearchParams({ id: groupVideoId }),
    });
    await modal.assert.isOpen();
    await modal.sidebar.switchMode("annotate");

    // Annotation should be disabled for grouped datasets with no supported slices
    await modal.sidebar.assert.hasDisabledMessage(
      "has no slices that support annotation"
    );
    await schemaManager.assert.isDisabled();
  });
});
