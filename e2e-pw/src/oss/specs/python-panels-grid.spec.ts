import { test as base, expect } from "src/oss/fixtures";
import { PythonPanelPom } from "src/oss/poms/operators/python-panel";
import { GridPanelPom } from "src/oss/poms/panels/grid-panel";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix(`python-panels-grid`);
const test = base.extend<{ panel: GridPanelPom }>({
  panel: async ({ page }, use) => {
    await use(new GridPanelPom(page));
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

test("Python Panels: Counter", async ({ eventUtils, panel }) => {
  const panelName = "e2e_counter_python_panel";
  const counter = new PythonPanelPom(eventUtils, panelName);
  const content = panel.getContent(panelName);
  const count = content.locator(".MuiAlert-standard");
  const click = (name: string) => () =>
    content.getByRole("button", { name }).click();

  await counter.afterRender(() => panel.open(panelName));
  expect(await count.textContent()).toBe("Count: 0");
  await counter.afterRender(click("Increment"));
  expect(await count.textContent()).toBe("Count: 1");
  await counter.afterRender(click("Increment"));
  expect(await count.textContent()).toBe("Count: 2");
  await counter.afterRender(click("Decrement"));
  expect(await count.textContent()).toBe("Count: 1");
});
