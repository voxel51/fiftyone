import { test as base } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix("detection-mask");
const testImgPath = "/tmp/detection-mask-img.png";

const test = base.extend<{ modal: ModalPom; grid: GridPom }>({
  modal: async ({ page, eventUtils }, use) => {
    await use(new ModalPom(page, eventUtils));
  },
  grid: async ({ page, eventUtils }, use) => {
    await use(new GridPom(page, eventUtils));
  },
});

test.beforeAll(async ({ fiftyoneLoader, mediaFactory }) => {
  await mediaFactory.createBlankImage({
    outputPath: testImgPath,
    width: 25,
    height: 25,
  });

  await fiftyoneLoader.executePythonCode(
    `
        import fiftyone as fo

        dataset = fo.Dataset("${datasetName}")
        dataset.persistent = True
        
        dataset.add_sample(fo.Sample(filepath="${testImgPath}"))
        sample = dataset.first()
        sample["ground_truth"] = fo.Detections(
            detections=[
                fo.Detection(
                    label="bad_mask_detection",
                    bounding_box=[0.0, 0.0, 0.0, 0.0],
                    mask=np.empty((0, 0)),
                ),
            ]
        )
        sample.save()
        `
  );
});

test.beforeEach(async ({ page, fiftyoneLoader }) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
});

test.describe("detection-mask", () => {
  test("should load empty mask fine", async ({ grid, modal }) => {
    await grid.assert.isEntryCountTextEqualTo("1 sample");
    await grid.openFirstSample();
    await modal.waitForSampleLoadDomAttribute();
  });
});
