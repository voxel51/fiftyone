import { test as base } from "src/oss/fixtures";
import { OperatorsBrowserPom } from "src/oss/poms/operators/operators-browser";
import { OperatorsPromptPom } from "src/oss/poms/operators/operators-prompt";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix("operators-prompt");
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
    await operatorsPrompt.assert.hasContent("Message:Hi E2E!");
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
    await operatorsPromptDrawer.assert.hasContent("Message:Hi E2E!");
    await operatorsPromptDrawer.close();
    await operatorsPromptDrawer.assert.isClosed();
  });

  test("Prompt: Progress", async ({
    operatorsBrowser,
    operatorsPrompt,
    operatorsPromptViewModal,
  }) => {
    await operatorsBrowser.show();
    await operatorsBrowser.search("E2E");
    // the operator shows each step for half a second before the next
    await operatorsPromptViewModal.afterOutput(
      () => operatorsBrowser.choose("E2E: Progress"),
      "percent_complete",
      0.5,
    );
    await operatorsPrompt.assert.isExecuting();
    await operatorsPromptViewModal.assert.hasContent("Loading 1 of 2");
    // the run closes its prompt once the last step has shown
    await operatorsPrompt.untilClosed();
    await operatorsPromptViewModal.assert.hasContent("Loading 2 of 2");
    await operatorsPromptViewModal.done();
    await operatorsPrompt.assert.isClosed();
    await operatorsPromptViewModal.assert.isClosed();
  });
});
