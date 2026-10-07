import { test as base, expect } from "src/oss/fixtures";
import { HistogramPom } from "src/oss/poms/panels/histogram-panel";
import { GridPanelPom } from "src/oss/poms/panels/grid-panel";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix(`histograms`);
const test = base.extend<{ histogram: HistogramPom; panel: GridPanelPom }>({
  panel: async ({ page }, use) => {
    await use(new GridPanelPom(page));
  },
  histogram: async ({ page, eventUtils }, use) => {
    await use(new HistogramPom(page, eventUtils));
  },
});

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test.beforeAll(async ({ fiftyoneLoader, foWebServer }) => {
  await foWebServer.startWebServer();
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
            bool=i % 2 == 0,
            str=f"{i}",
            int=i % 2,
            float=i / 2,
            list_str=[f"{i}"],
            list_int=[i % 2],
            list_float=[i / 2],
            list_bool=[i % 2 == 0],
        )
        samples.append(sample)
    
    dataset.add_samples(samples)`);
});

test.beforeEach(async ({ page, fiftyoneLoader }) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
});

test("histograms panel", async ({ histogram, panel }) => {
  await panel.open("Histograms");
  await histogram.assert.isLoaded();

  await histogram.assert.verifyField("bool");

  await histogram.selector.openResults();
  await histogram.assert.verifyFields([
    "bool",
    "created_at",
    "classification.confidence",
    "classification.label",
    "classification.tags",
    "detections.detections.confidence",
    "detections.detections.index",
    "detections.detections.label",
    "detections.detections.mask_path",
    "detections.detections.tags",
    "float",
    "int",
    "last_modified_at",
    "list_bool",
    "list_float",
    "list_int",
    "list_str",
    "metadata.height",
    "metadata.mime_type",
    "metadata.num_channels",
    "metadata.size_bytes",
    "metadata.width",
    "str",
    "tags",
  ]);
  await expect(histogram.locator).toHaveScreenshot("bool-histogram.png", {
    animations: "allow",
  });
  await histogram.selector.closeResults();

  await histogram.selectField("float");
  await expect(histogram.locator).toHaveScreenshot("float-histogram.png", {
    animations: "allow",
  });
});
