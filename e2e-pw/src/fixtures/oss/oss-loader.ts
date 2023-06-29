import { Page } from "@playwright/test";
import { PythonRunner } from "src/python-runner/python-runner";
import { getStringifiedKwargs } from "src/utils/commands";
import { AbstractFiftyoneLoader } from "../abstract-loader";

export class OssLoader extends AbstractFiftyoneLoader {
  async loadZooDataset(
    zooDatasetName: string,
    kwargs: Record<string, string> = {}
  ) {
    const kwargsStringified = getStringifiedKwargs(kwargs);

    PythonRunner.exec(
      `
      import fiftyone as fo
      import fiftyone.zoo as foz

      quickstart_groups_dataset = foz.load_zoo_dataset(
        ${zooDatasetName}${kwargsStringified}
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

      // behavior of directly visiting the dataset page is sometimes flaky
      if (!location.includes("datasets")) {
        await forceDatasetFromSelector();
      }
    }

    await page.waitForSelector("[data-cy=fo-grid]");
  }
}
