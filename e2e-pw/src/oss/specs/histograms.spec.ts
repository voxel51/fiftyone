import { expect, test as base } from "src/oss/fixtures";
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
  const boolBars = await histogram.afterLoad(
    () => panel.open("Histograms"),
    "bool",
  );
  expect(boolBars).toBe("True:5 False:5");

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
  await histogram.selector.closeResults();

  // float = i / 2 for i in 0..9, across 25 bins of width 0.18 on [0, 4.5]
  expect(await histogram.selectField("float")).toBe(
    "0.09:1 0.27:0 0.45:1 0.63:0 0.81:0 0.99:1 1.17:0 1.35:0 1.53:1 1.71:0 " +
      "1.89:0 2.07:1 2.25:0 2.43:1 2.61:0 2.79:0 2.97:1 3.15:0 3.33:0 3.51:1 " +
      "3.69:0 3.87:0 4.05:1 4.23:0 4.41:1",
  );
});
