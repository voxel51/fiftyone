import { test as base } from "src/oss/fixtures";
import { ModalPom } from "src/oss/poms/modal";
import { SchemaManagerPom } from "src/oss/poms/schema-manager";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix("image-classification");

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
    await modal.sidebar.setMode("annotate");
    await schemaManager.open();
    await schemaManager.assert.isOpen();

    // Configure
    const row = schemaManager.getFieldRow("classification");
    const jsonEditor = await row.edit();
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

    // Save
    await jsonEditor.save();
    await schemaManager.back();

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
    await row.assert.isChecked(false);
    await schemaManager.moveFields();
    await schemaManager.assert.hasHiddenFieldRows([
      { name: "classification", type: "Classification" },
    ]);

    // Close
    await schemaManager.close();
    await schemaManager.assert.isClosed();
  });
});
