import os from "node:os";
import path from "node:path";
import { test as base } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix("smoke-detections");
const maskPath = path.join(os.tmpdir(), `${datasetName}-mask.png`);

const test = base.extend<{
  grid: GridPom;
  modal: ModalPom;
}>({
  grid: async ({ page, eventUtils }, use) => {
    await use(new GridPom(page, eventUtils));
  },
  modal: async ({ page, eventUtils }, use) => {
    await use(new ModalPom(page, eventUtils));
  },
});

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test.beforeAll(async ({ datasetFactory, foWebServer, mediaFactory }) => {
  await foWebServer.startWebServer();
  mediaFactory.createMaskImage({
    outputPath: maskPath,
    width: 50,
    height: 50,
    value: 1,
  });
  await datasetFactory.createDataset({
    datasetName,
    schema: {
      emb_doc_fld: "DynamicEmbeddedDocument",
      "emb_doc_fld.seg": "Segmentation",
      "emb_doc_fld.seg.label": "StringField",
    },
    withSampleData: (_, { label }) => ({
      emb_doc_fld: {
        _cls: "DynamicEmbeddedDocument",
        seg: label.segmentation({ label: "cat", mask_path: maskPath }),
      },
    }),
  });
});

test.describe
  .serial("dynamic embedded documents (DED) visibility / filter", () => {
  test.beforeEach(async ({ page, fiftyoneLoader }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
  });

  test("Sample modal opens when the sample has segmentation mask label from disk mask_path", async ({
    grid,
    modal,
  }) => {
    await modal.afterSampleLoaded(() => grid.openFirstSample());
    await modal.assert.verifyModalOpenedSuccessfully();
  });
});
