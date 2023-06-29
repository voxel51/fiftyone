import { Page } from "@playwright/test";
import { PythonRunner } from "./python-runner/python-runner";

type ExitCode = number;
export abstract class DatasetLocator {
  abstract visit(path: string): Page;
}

export abstract class AbstractFiftyoneLoader {
  protected pythonRunner: PythonRunner;

  /**
   * This method is used to load a dataset from the FiftyOne Zoo.
   *
   * @param name name of the dataset to load from the zoo
   * @param id name of the dataset to be created
   * @param kwargs optional arguments to be passed to the dataset loader
   */
  abstract loadZooDataset(
    name: string,
    id: string,
    kwargs?: Record<string, string | number | boolean>
  ): Promise<ExitCode>;

  /**
   * This method is used to load datasets that are assumed to be already available in the test hosts.
   *
   * @param name name of the dataset to load
   */
  abstract loadTestDataset(name: string): Promise<void>;

  /**
   * Execute arbitrary python code.
   *
   * @param code python code to be executed
   */
  abstract executePythonCode(code: string): Promise<void>;

  /**
   * Wait until the dataset is loaded into the view.
   *
   * @param page Playwright page object.
   * @param datasetName Name of the dataset to be loaded into the view.
   */
  abstract waitUntilLoad(page: Page, datasetName: string): Promise<void>;
}
