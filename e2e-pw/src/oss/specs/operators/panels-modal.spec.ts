import { test as base, expect } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const SAMPLE_TAB_LABEL = "Sample";
const COUNTER_TAB_ID = "e2e_counter_python_panel";
const COUNTER_TAB_LABEL = "E2E: Counter Python Panel";

const datasetName = getUniqueDatasetNameWithPrefix(`panels-modal`);
const test = base.extend<{
  grid: GridPom;
  modal: ModalPom;
}>({
  modal: async ({ page, eventUtils }, use) => {
    await use(new ModalPom(page, eventUtils));
  },
  grid: async ({ page, eventUtils }, use) => {
    await use(new GridPom(page, eventUtils));
  },
});

test.beforeAll(async ({ fiftyoneLoader }) => {
  await fiftyoneLoader.executePythonCode(`
    import fiftyone as fo
    dataset = fo.Dataset("${datasetName}")
    dataset.persistent = True

    samples = []
    for i in range(0, 5):
        sample = fo.Sample(filepath=f"{i}.png", count=i)
        samples.append(sample)
    
    dataset.add_samples(samples)`);
});

test.beforeEach(async ({ page, fiftyoneLoader }) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
});

test("Modal Panels: Counter", async ({ grid, modal }) => {
  await grid.openFirstSample();
  await modal.waitForSampleLoadDomAttribute(true);
  await modal.panel.assert.verifyAvailableTabs([
    SAMPLE_TAB_LABEL,
    COUNTER_TAB_LABEL,
  ]);

  await modal.panel.bringPanelToForeground(COUNTER_TAB_ID);

  const content = modal.panel.getContent(COUNTER_TAB_ID);
  await expect(content.getByText("Count: 0")).toBeVisible();
});
