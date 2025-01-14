import { test as base, expect } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix("detection-mask");

const colors = ["#ff0000", "#00ff00", "#0000ff"];

const badDetectionMaskSampleImage = "/tmp/detection-bad-mask-img.png";
const goodDetectionMaskSampleImage = "/tmp/detection-good-mask-img.png";
const goodDetectionMaskPathSampleImage = "/tmp/detection-mask-path-img.png";

const goodDetectionMaskOnDisk = "/tmp/detection-mask-on-disk.png";

const test = base.extend<{ modal: ModalPom; grid: GridPom }>({
  modal: async ({ page, eventUtils }, use) => {
    await use(new ModalPom(page, eventUtils));
  },
  grid: async ({ page, eventUtils }, use) => {
    await use(new GridPom(page, eventUtils));
  },
});

test.beforeAll(async ({ fiftyoneLoader, mediaFactory }) => {
  await Promise.all(
    [
      badDetectionMaskSampleImage,
      goodDetectionMaskSampleImage,
      goodDetectionMaskPathSampleImage,
    ].map((img, index) => {
      const fillColor = colors[index];
      mediaFactory.createBlankImage({
        outputPath: img,
        width: 25,
        height: 25,
        fillColor: fillColor,
      });
    })
  );

  await fiftyoneLoader.executePythonCode(
    `
        import fiftyone as fo
        import numpy as np

        from PIL import Image

        dataset = fo.Dataset("${datasetName}")
        dataset.persistent = True

        samples = []

        # sample with bad detection mask
        badDetectionMaskSample = fo.Sample(filepath="${badDetectionMaskSampleImage}")
        badDetectionMaskSample["ground_truth"] = fo.Detections(
            detections=[
                fo.Detection(
                    label="bad_mask_detection",
                    bounding_box=[0.0, 0.0, 0.0, 0.0],
                    mask=np.empty((0, 0)),
                ),
            ]
        )
        samples.append(badDetectionMaskSample)

        # sample with good detection mask
        goodDetectionMaskSample = fo.Sample(filepath="${goodDetectionMaskSampleImage}")
        goodDetectionMaskSample["ground_truth"] = fo.Detections(
            detections=[
                fo.Detection(
                    label="good_mask_detection",
                    bounding_box=[0.0, 0.0, 0.5, 0.5],
                    mask=np.ones((15, 15)),
                ),
            ]
        )
        samples.append(goodDetectionMaskSample)

        # sample with good detection mask _path_
        img = Image.fromarray(np.ones((15, 15), dtype=np.uint8))
        img.save("${goodDetectionMaskOnDisk}")

        goodDetectionMaskPathSample = fo.Sample(filepath="${goodDetectionMaskPathSampleImage}")
        goodDetectionMaskPathSample["prediction"] = fo.Detection(
                    label="good_mask_detection_path",
                    bounding_box=[0.0, 0.0, 0.5, 0.5],
                    mask_path="${goodDetectionMaskOnDisk}",
                )
        samples.append(goodDetectionMaskPathSample)
        
        dataset.add_samples(samples)

        dataset.app_config.default_visibility_labels = {"include": ["ground_truth", "prediction"]}
        dataset.save()
        `
  );
});

test.beforeEach(async ({ page, fiftyoneLoader }) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
});

test.describe("detection-mask", () => {
  test("should load all masks fine", async ({ grid, modal }) => {
    await grid.assert.isEntryCountTextEqualTo("3 samples");

    // bad sample, assert it loads in the modal fine, too
    await grid.openFirstSample();
    await modal.waitForSampleLoadDomAttribute();

    // close modal and assert grid screenshot (compares all detections)
    await modal.close();

    await expect(grid.getForwardSection()).toHaveScreenshot(
      "grid-detections.png",
      {
        animations: "allow",
      }
    );
  });
});
