import { test as base, expect } from "src/oss/fixtures";
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
  operatorsBrowser: async ({ page }, use) => {
    await use(new OperatorsBrowserPom(page));
  },
  operatorsPrompt: async ({ page }, use) => {
    await use(new OperatorsPromptPom(page));
  },
  operatorsPromptViewModal: async ({ page }, use) => {
    await use(new OperatorsPromptPom(page, "view-modal"));
  },
  operatorsPromptDrawer: async ({ page }, use) => {
    await use(new OperatorsPromptPom(page, "drawer"));
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

test("Prompt: Cancel modal", async ({ operatorsBrowser, operatorsPrompt }) => {
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
  await operatorsPrompt.locator
    .locator("input")
    .first()
    .pressSequentially("E2E");
  await operatorsPrompt.assert.isValidated();
  await operatorsPrompt.execute();
  await operatorsPrompt.assert.isExecuting();
  await expect(operatorsPrompt.content).toContainText("Message:Hi E2E!");
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
  await operatorsPromptDrawer.locator
    .locator("input")
    .first()
    .pressSequentially("E2E");
  await operatorsPromptDrawer.assert.isValidated();
  await operatorsPromptDrawer.execute();
  await operatorsPromptDrawer.assert.isExecuting();
  await expect(operatorsPromptDrawer.content).toContainText("Message:Hi E2E!");
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
  await operatorsBrowser.choose("E2E: Progress");
  await operatorsPrompt.assert.isExecuting();
  await expect(operatorsPromptViewModal.content).toContainText(
    "Loading 1 of 2"
  );
  await expect(operatorsPromptViewModal.content).toContainText(
    "Loading 2 of 2"
  );
  await operatorsPromptViewModal.done();
  await operatorsPrompt.assert.isClosed();
  await operatorsPromptViewModal.assert.isClosed();
});
