import { test as base } from "src/oss/fixtures";
import { OperatorsBrowserPom } from "src/oss/poms/operators/operators-browser";
import { OperatorsPromptPom } from "src/oss/poms/operators/operators-prompt";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix("operators-prompt");

/** The hello operators' output: the "Message" label, then their greeting */
const GREETING = "Message:Hi E2E!";

/** E2E: Progress at `step` of 2: its percent, then its label */
const progressText = (step: number) =>
  `${Math.round((step / 2) * 100)}%Loading ${step} of 2`;
const test = base.extend<{
  operatorsBrowser: OperatorsBrowserPom;
  operatorsPrompt: OperatorsPromptPom;
  operatorsPromptViewModal: OperatorsPromptPom;
  operatorsPromptDrawer: OperatorsPromptPom;
}>({
  operatorsBrowser: async ({ page, eventUtils }, use) => {
    await use(new OperatorsBrowserPom(page, eventUtils));
  },
  operatorsPrompt: async ({ page, eventUtils }, use) => {
    await use(new OperatorsPromptPom(page, eventUtils));
  },
  operatorsPromptViewModal: async ({ page, eventUtils }, use) => {
    await use(new OperatorsPromptPom(page, eventUtils, "view-modal"));
  },
  operatorsPromptDrawer: async ({ page, eventUtils }, use) => {
    await use(new OperatorsPromptPom(page, eventUtils, "drawer"));
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

test.describe.serial("operator prompt", () => {
  test("Prompt: Cancel modal", async ({
    operatorsBrowser,
    operatorsPrompt,
  }) => {
    await operatorsBrowser.show();
    await operatorsBrowser.search("E2E");
    await operatorsBrowser.choose("E2E: Say hello in modal");
    await operatorsPrompt.locator.locator("input").first().fill("E2E");
    await operatorsPrompt.assert.isOpen();
    await operatorsPrompt.cancel();
    await operatorsPrompt.assert.isClosed();
  });

  test("Prompt: Say hello in modal", async ({
    operatorsBrowser,
    operatorsPrompt,
  }) => {
    await operatorsBrowser.show();
    await operatorsBrowser.search("E2E");
    await operatorsBrowser.choose("E2E: Say hello in modal");
    await operatorsPrompt.assert.isOpen();
    await operatorsPrompt.typeInput("E2E");
    await operatorsPrompt.assert.isValidated();
    await operatorsPrompt.assert.canExecute();
    await operatorsPrompt.execute();
    await operatorsPrompt.assert.hasContent(GREETING);
    await operatorsPrompt.close();
    await operatorsPrompt.assert.isClosed();
  });

  test("Prompt: Cancel drawer", async ({
    operatorsBrowser,
    operatorsPromptDrawer,
  }) => {
    await operatorsBrowser.show();
    await operatorsBrowser.search("E2E");
    await operatorsBrowser.choose("E2E: Say hello in drawer");
    await operatorsPromptDrawer.locator.locator("input").first().fill("E2E");
    await operatorsPromptDrawer.assert.isOpen();
    await operatorsPromptDrawer.cancel();
    await operatorsPromptDrawer.assert.isClosed();
  });

  test("Prompt: Say hello in drawer", async ({
    operatorsBrowser,
    operatorsPromptDrawer,
  }) => {
    await operatorsBrowser.show();
    await operatorsBrowser.search("E2E");
    await operatorsBrowser.choose("E2E: Say hello in drawer");
    await operatorsPromptDrawer.assert.isOpen();
    await operatorsPromptDrawer.typeInput("E2E");
    await operatorsPromptDrawer.assert.isValidated();
    await operatorsPromptDrawer.assert.canExecute();
    await operatorsPromptDrawer.execute();
    await operatorsPromptDrawer.assert.hasContent(GREETING);
    await operatorsPromptDrawer.close();
    await operatorsPromptDrawer.assert.isClosed();
  });

  test("Prompt: Progress", async ({
    fiftyoneLoader,
    operatorsBrowser,
    operatorsPrompt,
    operatorsPromptViewModal,
  }) => {
    await operatorsBrowser.show();
    await operatorsBrowser.search("E2E");
    // the operator holds at its halfway step until the spec releases it
    await operatorsPromptViewModal.afterOutput(
      () => operatorsBrowser.choose("E2E: Progress"),
      "percent_complete",
      0.5,
    );
    await operatorsPrompt.assert.isExecuting();
    await operatorsPromptViewModal.assert.hasContent(progressText(1));
    // the released run shows its last step and closes its prompt
    await operatorsPrompt.afterClosed(() =>
      fiftyoneLoader.executePythonCode(`
      import fiftyone.operators as foo

      foo.ExecutionStore.create("e2e_progress_release").set("${datasetName}", 1)
    `),
    );
    await operatorsPromptViewModal.assert.hasContent(progressText(2));
    await operatorsPromptViewModal.done();
    await operatorsPrompt.assert.isClosed();
    await operatorsPromptViewModal.assert.isClosed();
  });
});
