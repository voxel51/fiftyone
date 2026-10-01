import { Page } from "@playwright/test";
import { PythonRunner } from "./python-runner/python-runner";

export type WaitUntilGridVisibleOptions = {
  /**
   * Search parameters to include
   */
  searchParams?: URLSearchParams;

  /**
   * An `e2e:` event that marks the page ready instead of a grid tile, e.g.
   * the modal a deep link opens
   */
  readyEvent?: string;

  /**
   * The number of distinct grid lookers that must have drawn (by default,
   * one tile of any kind ready)
   */
  tiles?: number;

  /**
   * Also wait for the modal a deep link opens to draw its sample, or to
   * draw it or show its load error
   */
  modalSample?: "loaded" | "loaded-or-error";
};
export abstract class AbstractFiftyoneLoader {
  protected pythonRunner: PythonRunner;

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
    datasetName: string,
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
    options?: WaitUntilGridVisibleOptions,
  ): Promise<void>;
}
