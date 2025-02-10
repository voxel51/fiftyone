import { Page } from "@playwright/test";
import { PythonRunner } from "./python-runner/python-runner";

export type WaitUntilGridVisibleOptions = {
  /**
   * Whether the dataset is empty.
   */
  isEmptyDataset?: boolean;

  /**
   * Search parameters to include
   */
  searchParams?: URLSearchParams;

  /**
   * Whether to wait for the grid to be visible.
   */
  withGrid?: boolean;
};
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
   * Select a dataset from the dataset selector.
   * This method doesn't result in a page reload.
   *
   * @param page Playwright page object.
   * @param datasetName Name of the dataset to be selected.
   */
  abstract selectDatasetFromSelector(
    page: Page,
    datasetName: string
  ): Promise<void>;

  /**
   * Wait until the dataset is loaded into the view.
   *
   * @param page Playwright page object.
   * @param datasetName Name of the dataset to be loaded into the view.
   * @param options Options to be used when waiting for the grid to be visible.
   */
  abstract waitUntilGridVisible(
    page: Page,
    datasetName: string,
    options?: WaitUntilGridVisibleOptions
  ): Promise<void>;
}
