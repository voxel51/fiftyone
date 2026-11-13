import { test as base, expect } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { PythonPanelPom } from "src/oss/poms/operators/python-panel";
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

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test.beforeAll(async ({ datasetFactory, foWebServer }) => {
  await foWebServer.startWebServer();
  await datasetFactory.createDataset({ datasetName });
});

test.beforeEach(async ({ page, fiftyoneLoader }) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
});

test("Modal Panels: Counter", async ({ eventUtils, grid, modal }) => {
  await modal.afterSampleLoaded(() => grid.openFirstSample(), true);
  await modal.panel.assert.verifyAvailableTabs([
    SAMPLE_TAB_LABEL,
    COUNTER_TAB_LABEL,
  ]);

  // the panel mounts, and so loads, when its tab is first brought forward
  await new PythonPanelPom(eventUtils, COUNTER_TAB_ID).afterRender(() =>
    modal.panel.bringPanelToForeground(COUNTER_TAB_ID),
  );

  const content = modal.panel.getContent(COUNTER_TAB_ID);
  expect(await content.getByText("Count: 0").isVisible()).toBe(true);
});
