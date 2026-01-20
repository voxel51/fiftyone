import { test as base } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { SchemaManagerPom } from "src/oss/poms/schema-manager";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";
import { createBlankImage } from "src/shared/media-factory/image";

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
  schemaManager: async ({ page }, use) => {
    await use(new SchemaManagerPom(page));
  },
});

const writeImage = async () => {
  await createBlankImage({
    outputPath: "/tmp/blank.png",
    width: 50,
    height: 50,
    fillColor: "#ffffff",
    hideLogs: true,
  });
};

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test.beforeAll(async ({ fiftyoneLoader, foWebServer }) => {
  await foWebServer.startWebServer();

  await writeImage();

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

test.describe.serial("image classification", () => {
  test.beforeEach(async ({ page, fiftyoneLoader }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
      searchParams: new URLSearchParams({ id }),
    });
  });

  test("JSON view", async ({ modal, schemaManager }) => {
    await modal.assert.isOpen();
    await modal.sidebar.setMode("annotate");
    await schemaManager.open();
    await schemaManager.assert.isVisible();
    await schemaManager.getFieldRow("classification").edit();
    await schemaManager.close();
    await schemaManager.assert.isHidden();
  });
});
