import { test as base } from "src/oss/fixtures";
import { PanelPom } from "src/oss/poms/panel";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const test = base.extend<{ panel: PanelPom }>({
  panel: async ({ page }, use) => {
    await use(new PanelPom(page));
  },
});

const datasetName = getUniqueDatasetNameWithPrefix(`empty-groups`);

test.beforeAll(async ({ fiftyoneLoader }) => {
  await fiftyoneLoader.executePythonCode(`
    import fiftyone as fo
    dataset = fo.Dataset("${datasetName}")
    dataset.add_group_field("group", default="empty")
    dataset.persistent = True
  `);
});

test.beforeEach(async ({ page, fiftyoneLoader }) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
    isEmptyDataset: true,
  });
});

test("empty dataset without default slice", async ({ panel }) => {
  await panel.assert.hasError();
});
