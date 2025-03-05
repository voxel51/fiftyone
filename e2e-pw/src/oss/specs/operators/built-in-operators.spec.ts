import { test as base } from "src/oss/fixtures";
import { OperatorsBrowserPom } from "src/oss/poms/operators/operators-browser";
import { ViewBarPom } from "src/oss/poms/viewbar/viewbar";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix("built-in-operators");
const test = base.extend<{
  operatorsBrowser: OperatorsBrowserPom;
  viewBar: ViewBarPom;
}>({
  operatorsBrowser: async ({ page }, use) => {
    await use(new OperatorsBrowserPom(page));
  },
  viewBar: async ({ page }, use) => {
    await use(new ViewBarPom(page));
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

test("Built-in operators: set view", async ({ viewBar, operatorsBrowser }) => {
  await operatorsBrowser.show();
  await operatorsBrowser.search("E2E");
  await operatorsBrowser.choose("E2E: Set view");
  await viewBar.assert.hasViewStage("Limit3");
});
