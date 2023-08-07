import { test as base, expect } from "src/oss/fixtures";
import { PanelPom } from "src/oss/poms/panel";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix(`histograms`);
const test = base.extend<{ panel: PanelPom }>({
  panel: async ({ page }, use) => {
    await use(new PanelPom(page));
  },
});

test.beforeAll(async ({ fiftyoneLoader }) => {
  await fiftyoneLoader.executePythonCode(`
    import fiftyone as fo
    dataset = fo.Dataset("${datasetName}")
    dataset.persistent = True

    samples = []
    for i in range(0, 10):
        sample = fo.Sample(
            filepath=f"{i}.png",
            detections=fo.Detections(detections=[fo.Detection(label=f"label-{i}")]),
            classification=fo.Classification(label=f"label-{i}"),
            bool=False,
            str="str",
            int=0,
            float=0.0,
            list_str=["str"],
            list_int=[0],
            list_float=[0.0],
            list_bool=[True],
        )
        samples.append(sample)
    
    dataset.add_samples(samples)`);
});

test.beforeEach(async ({ page, fiftyoneLoader }) => {
  await fiftyoneLoader.waitUntilLoad(page, datasetName);
});

test("histograms panel", async ({ panel }) => {
  await panel.openNew("histograms");
  await panel.assert.histogramLoaded();
  await expect(await panel.distributionContainer()).toHaveScreenshot(
    "default-histogram.png"
  );
});
