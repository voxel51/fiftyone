import { test as base } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix("smoke-quickstart");

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

test.describe("dynamic embedded documents (DED) visibility / filter", () => {
  test.beforeAll(async ({ fiftyoneLoader }) => {
    await fiftyoneLoader.executePythonCode(`
      import fiftyone as fo
      dataset = fo.Dataset("${datasetName}")
      dataset.persistent = True
  
      sample1 = fo.Sample(filepath="src/shared/assets/images/test.png")
      dataset.add_samples([sample1])
      dataset.save()

      sample = dataset.first()

      seg = fo.Segmentation(
        label='cat',
        mask_path='src/shared/assets/masks/mask.png'
      )

      sample['emb_doc_fld'] = fo.DynamicEmbeddedDocument(seg=seg)
      sample.save()
      
      dataset.add_dynamic_sample_fields()
      dataset.save()
    `);
  });

  test.beforeEach(async ({ page, fiftyoneLoader }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
  });

  test("Sample modal opens when the sample has segmentation mask label from disk mask_path", async ({
    grid,
    modal,
  }) => {
    await grid.openFirstSample();
    await modal.assert.verifyModalOpenedSuccessfully();
  });
});
