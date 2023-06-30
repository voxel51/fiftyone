import { Page, expect } from "@playwright/test";
import { getPythonCommand, getStringifiedKwargs } from "src/oss/utils/commands";
import { AbstractFiftyoneLoader } from "src/shared/abstract-loader";
import { PythonRunner } from "src/shared/python-runner/python-runner";
import { Duration } from "../utils";
export class OssLoader extends AbstractFiftyoneLoader {
  constructor() {
    super();
    this.pythonRunner = new PythonRunner(getPythonCommand);
  }

  async loadZooDataset(
    zooDatasetName: string,
    id: string,
    kwargs: Record<string, string> = {}
  ) {
    const kwargsStringified = getStringifiedKwargs(kwargs);

    return this.pythonRunner.exec(
      `
      import fiftyone as fo
      import fiftyone.zoo as foz

      if fo.dataset_exists("${id}"):
        fo.delete_dataset("${id}")

      quickstart_groups_dataset = foz.load_zoo_dataset(
        "${zooDatasetName}", dataset_name="${id}"${kwargsStringified}
      )
      quickstart_groups_dataset.persistent = True
    `
    );
  }

  async loadTestDataset(name: string) {
    throw new Error("Method not implemented.");
  }

  async executePythonCode(code: string) {
    throw new Error("Method not implemented.");
  }

  async executePythonFixture(fixturePath: string) {
    throw new Error("Method not implemented.");
  }

  async waitUntilLoad(page: Page, datasetName: string) {
    const forceDatasetFromSelector = async () => {
      await page.goto("/");
      await page.click(`[data-cy="selector-Select dataset"]`);

      if (datasetName) {
        await page.click(`[data-cy=selector-result-${datasetName}]`);
      } else {
        const firstSelectorResult = await page.$(
          `[data-cy^="selector-result"]`
        );
        await firstSelectorResult.click();
      }
    };

    if (!datasetName) {
      await forceDatasetFromSelector();
    } else {
      await page.goto(`/datasets/${datasetName}`);
      const location = await page.evaluate(() => window.location.href);

      if (!location.includes("datasets")) {
        await forceDatasetFromSelector();
      }
    }

    await page.waitForSelector("[data-cy=fo-grid]", { state: "visible" });

    // todo: emit an event when grid is loaded and wait for the event
    await page.waitForTimeout(Duration.Seconds(0.5));
  }
}
