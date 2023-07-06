import { Page } from "@playwright/test";
import { PythonRunner } from "./python-runner/python-runner";

type WebServerProcessConfig = {
  port: number;
  processId: number;
};

export abstract class AbstractFiftyoneLoader {
  protected pythonRunner: PythonRunner;
  protected webserverProcessConfig: WebServerProcessConfig;

  /**
   * This method is used to start the FiftyOne webserver.
   *
   * @param port port on which the webserver should be started
   */
  abstract startWebServer(port: number): Promise<void>;

  /**
   * This method is used to stop the FiftyOne webserver.
   *
   */
  abstract stopWebServer(): Promise<void>;

  /**
   * This method is used to load a dataset from the FiftyOne Zoo.
   *
   * @param name name of the dataset to load from the zoo
   * @param id name of the dataset to be created
   * @param kwargs optional arguments to be passed to the dataset loader
   */
  abstract loadZooDataset(
    zooDatasetName: string,
    id: string,
    kwargs?: Record<string, string | number | boolean>
  ): Promise<void>;

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
