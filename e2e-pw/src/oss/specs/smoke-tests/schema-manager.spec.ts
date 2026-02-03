import { test as base, expect } from "src/oss/fixtures";
import { ModalPom } from "src/oss/poms/modal";
import { SchemaManagerPom } from "src/oss/poms/schema-manager";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix("image-classification");
const videoDatasetName = getUniqueDatasetNameWithPrefix("video-dataset");

const id = "000000000000000000000000";
const videoId = "000000000000000000000001";

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
  dataset._sample_collection.insert_many(
      [dataset._make_dict(sample, include_id=True)]
  )
  dataset.save()`);
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
  test.beforeEach(async ({ fiftyoneLoader, page }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
      searchParams: new URLSearchParams({ id }),
    });
  });

  test("JSON view configuration", async ({ modal, schemaManager }) => {
    // Init
    await modal.assert.isOpen();
    await modal.sidebar.switchMode("annotate");
    await schemaManager.open();
    await schemaManager.assert.isOpen();

    // Configure
    const row = schemaManager.getFieldRow("classification");
    // on initial scan is scan, later it's edit()
    const jsonEditor = await row.scan();
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
  }) => {
    // Start on image dataset - annotate tab should be functional
    await modal.assert.isOpen();
    await modal.sidebar.switchMode("annotate");
    await expect(page.getByTestId("open-schema-manager")).toBeEnabled();

    // Switch to video dataset
    await modal.close();
    await fiftyoneLoader.waitUntilGridVisible(page, videoDatasetName, {
      searchParams: new URLSearchParams({ id: videoId }),
    });
    await modal.assert.isOpen();
    await modal.sidebar.switchMode("annotate");

    // Annotation should be disabled for video datasets
    await expect(
      page.getByText("isn\u2019t supported for video datasets")
    ).toBeVisible();
    await expect(page.getByTestId("open-schema-manager")).toBeDisabled();
  });
});
