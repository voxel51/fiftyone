import { test as base, expect } from "src/oss/fixtures";
import { ModalPom } from "src/oss/poms/modal";
import { SchemaManagerPom } from "src/oss/poms/schema-manager";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix("image-classification");
const videoDatasetName = getUniqueDatasetNameWithPrefix("video-dataset");
const detectionDatasetName =
  getUniqueDatasetNameWithPrefix("detection-dataset");
const groupVideoDatasetName = getUniqueDatasetNameWithPrefix(
  "group-video-dataset",
);

const id = "000000000000000000000000";
const videoId = "000000000000000000000001";
const groupVideoId = "000000000000000000000003";

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

test.beforeAll(
  async ({ fiftyoneLoader, datasetFactory, mediaFactory, foWebServer }) => {
    await foWebServer.startWebServer();
    await datasetFactory.createDataset({
      datasetName,
      schema: {
        classification: "Classification",
      },
      withSampleData: (_, { createId }) => ({
        classification: { _id: createId(), label: "value" },
      }),
    });

    await datasetFactory.createDataset({
      datasetName: detectionDatasetName,
      schema: {
        predictions: "Detections",
      },
      withSampleData: (_, { createId }) => {
        return {
          predictions: {
            detections: [
              {
                _id: createId(id),
                label: "cat",
                bounding_box: [0.1, 0.1, 0.2, 0.2],
              },
              {
                _id: createId(),
                label: "dog",
                bounding_box: [0.3, 0.3, 0.2, 0.2],
              },
            ],
          },
        };
      },
      savedViews: { patches: "dataset.to_patches('predictions')" },
    });

    await mediaFactory.createVideo({
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
  dataset.save()
  # populate frame count / dimensions so the video looker can load and the
  # modal stays open
  dataset.compute_metadata()`);

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
  },
);

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
    // First save auto-activates the field
    await jsonEditor.save();

    // Field should already be active after first save
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

  test("the schema manager is available for a video dataset", async ({
    fiftyoneLoader,
    page,
    modal,
    schemaManager,
  }) => {
    // Video annotation is supported, so a video dataset exposes the same
    // annotate affordances as image/3D, including the schema manager. Wait on
    // the modal rather than the looker canvas, which never reports loaded for a
    // blank seeded video.
    await fiftyoneLoader.waitUntilGridVisible(page, videoDatasetName, {
      searchParams: new URLSearchParams({ id: videoId }),
      readySelector: '[data-cy="modal"]',
    });
    await modal.assert.isOpen();
    await modal.sidebar.switchMode("annotate");
    await schemaManager.assert.isEnabled();
<<<<<<< HEAD

    // Switch to video dataset
    await modal.close();
    await fiftyoneLoader.waitUntilGridVisible(page, videoDatasetName, {
      searchParams: new URLSearchParams({ id: videoId }),
    });
    await modal.assert.isOpen();
    await modal.sidebar.switchMode("annotate");

    // Annotation should be disabled for video datasets
    await modal.sidebar.assert.hasDisabledMessage(
      "isn\u2019t supported for video datasets",
    );
    await schemaManager.assert.isDisabled();
=======
>>>>>>> main
  });

  test("patches view required field prompt activates schema and enters edit mode", async ({
    fiftyoneLoader,
    page,
    modal,
  }) => {
    // Navigate to patches view
    await fiftyoneLoader.waitUntilGridVisible(page, detectionDatasetName, {
      searchParams: new URLSearchParams({ view: "patches", id }),
    });
    await modal.waitForSampleLoadDomAttribute();
    await modal.sidebar.switchMode("annotate");

    // The required field prompt should appear since "predictions" has no active schema
    await expect(page.getByText("Field not in label schema")).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.getByTestId("activate-field-schema")).toBeVisible();

    // Click the activate button to initialize and activate the predictions schema
    const activateButton = page.getByTestId("activate-field-schema");
    await expect(activateButton).toBeEnabled();
    await activateButton.click();

    // After activation, the edit panel should appear with "Edit Detection"
    await expect(page.getByText("Edit Detection")).toBeVisible({
      timeout: 10_000,
    });

    // In patches view, the Schema button should not be visible
    await expect(page.getByRole("button", { name: "Schema" })).toBeHidden();
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
      "has no slices that support annotation",
    );
    await schemaManager.assert.isDisabled();
  });
});
