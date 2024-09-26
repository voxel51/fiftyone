import { Page } from '@playwright/test';
import { getPythonCommand, getStringifiedKwargs } from 'oss/oss/utils/commands';
import { AbstractFiftyoneLoader } from 'oss/shared/abstract-loader';
import { PythonRunner } from 'oss/shared/python-runner/python-runner';

export class TeamsLoader extends AbstractFiftyoneLoader {
  public readonly pythonRunner: PythonRunner;

  constructor() {
    super();

    if (process.env.CI) {
      this.pythonRunner = new PythonRunner(getPythonCommand);
    } else {
      this.pythonRunner = new PythonRunner(getPythonCommand, {
        FIFTYONE_DATABASE_URI: `mongodb://localhost:${process.env.MONGO_PORT}/${process.env.FIFTYONE_DATABASE_NAME}`
      });
    }
  }

  async startWebServer() {}

  async stopWebServer() {}

  async loadZooDataset(
    zooDatasetName: string,
    id: string,
    kwargs: Record<string, string> = {}
  ) {
    const kwargsStringified = getStringifiedKwargs(kwargs);

    return this.pythonRunner.exec(`
      import fiftyone as fo
      import fiftyone.zoo as foz

      dataset = foz.load_zoo_dataset(
        "${zooDatasetName}", dataset_name="${id}"${kwargsStringified}
      )
      dataset.persistent = True
    `);
  }

  async loadTestDataset(name: string) {
    throw new Error('Method not implemented.');
  }

  async executePythonCode(code: string) {
    return this.pythonRunner.exec(code);
  }

  async executePythonFixture(fixturePath: string) {
    throw new Error('Method not implemented.');
  }

  async waitUntilGridVisible(page: Page, datasetName: string) {
    await page.goto(`/datasets/${datasetName}/samples`);
    await page.waitForSelector('[data-cy=flashlight-section]', {
      state: 'visible'
    });
  }
}
