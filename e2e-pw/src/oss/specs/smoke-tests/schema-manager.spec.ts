import { test as base } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { SchemaManagerPom } from "src/oss/poms/schema-manager";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix("image-classification");

const id = "000000000000000000000000";

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

  sample = fo.Sample(_id=ObjectId("${id}"), filepath="/tmp/blank.png")
  dataset._sample_collection.insert_many(
      [dataset._make_dict(sample, include_id=True)]
  )

  dataset.add_sample_field(
      "classification",
      fo.EmbeddedDocumentField,
      embedded_doc_type=fo.Classification,
  )
  dataset.add_sample_field(
      "classifications",
      fo.EmbeddedDocumentField,
      embedded_doc_type=fo.Classifications,
  )
  dataset.save()`);
});

test.describe.serial("schema manager", () => {
  test.beforeEach(async ({ fiftyoneLoader, page }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
      searchParams: new URLSearchParams({ id }),
    });
  });

  test("JSON view configuration", async ({ modal, schemaManager }) => {
    await modal.assert.isOpen();
    await modal.sidebar.setMode("annotate");
    await schemaManager.open();
    await schemaManager.assert.isOpen();
    const row = schemaManager.getFieldRow("classification");
    const jsonEditor = await row.edit();

    await jsonEditor.assert.hasJSON({
      attributes: {
        confidence: { type: "float", component: "text" },
        id: { type: "id", component: "text", read_only: true },
        tags: { type: "list<str>", component: "text" },
      },
      component: "text",
      type: "classification",
    });

    // Test validation
    const invalid = jsonEditor.expectInvalidJSON();
    await jsonEditor.setJSON({
      component: "wrong",
      type: "classification",
    });
    await invalid;
    await jsonEditor.assert.hasErrors([
      "invalid component 'wrong' for field 'classification'",
    ]);

    const valid = jsonEditor.expectValidJSON();
    await jsonEditor.setJSON({
      component: "text",
      type: "classification",
    });
    await valid;
    await jsonEditor.assert.hasJSON({
      component: "text",
      type: "classification",
    });

    // Test save
    await jsonEditor.save();
    await schemaManager.back();

    // Activate
    await row.assert.hasCheckbox();
    await row.check();
    await schemaManager.moveFields();
    await schemaManager.assert.hasActiveFieldRows([
      { name: "classification", type: "classification" },
    ]);

    // Hide
    await row.check();
    await schemaManager.moveFields();
    await schemaManager.assert.hasHiddenFieldRows([
      { name: "classification", type: "classification" },
    ]);

    // Close
    await schemaManager.close();
    await schemaManager.assert.isClosed();
  });
});
