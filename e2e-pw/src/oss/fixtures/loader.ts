import { Page } from "@playwright/test";
import { getPythonCommand, getStringifiedKwargs } from "src/oss/utils/commands";
import {
  AbstractFiftyoneLoader,
  WaitUntilGridVisibleOptions,
} from "src/shared/abstract-loader";
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

    return this.pythonRunner.exec(`
      import fiftyone.zoo as foz

      dataset = foz.load_zoo_dataset(
        "${zooDatasetName}", dataset_name="${id}"${kwargsStringified}
      )
      dataset.persistent = True
    `);
  }

  async loadTestDataset() {
    throw new Error("Method not implemented.");
  }

  async executePythonCode(code: string) {
    return this.pythonRunner.exec(code);
  }

  async executePythonFixture() {
    throw new Error("Method not implemented.");
  }

  async selectDatasetFromSelector(page: Page, datasetName: string) {
    await page.getByTestId("selector-dataset").click();
    await page.getByTestId(`selector-result-${datasetName}`).click();
  }

  async waitUntilGridVisible(
    page: Page,
    datasetName: string,
    options?: WaitUntilGridVisibleOptions,
    isRetry?: boolean
  ) {
    const { isEmptyDataset, searchParams, withGrid } = options ?? {
      isEmptyDataset: false,
      searchParams: undefined,
      withGrid: true,
    };

    await page.addInitScript(() => {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore injecting IS_PLAYWRIGHT into window so that
      // we can disable 1) analytics, and 2) QA performance toast banners
      window.IS_PLAYWRIGHT = true;
    });

    const forceDatasetFromSelector = async () => {
      await page.goto("/", { waitUntil: "domcontentloaded" });
      await page.getByTestId("selector-dataset").click();

      if (datasetName) {
        await page.getByTestId(`selector-result-${datasetName}`).click();
      } else {
        const firstSelectorResult = page.locator(
          "[data-cy=selector-results-container] > div"
        );
        await firstSelectorResult.click();
      }
    };

    const search = searchParams ? searchParams.toString() : undefined;
    if (search) {
      await page.goto(`/datasets/${datasetName}?${search}`, {
        waitUntil: "domcontentloaded",
      });
    } else {
      await page.goto(`/datasets/${datasetName}`, {
        waitUntil: "domcontentloaded",
      });
    }

    const pathname = await page.evaluate(() => window.location.pathname);
    if (pathname !== `/datasets/${datasetName}`) {
      await forceDatasetFromSelector();
    }

    const view = searchParams?.get("view");
    if (view) {
      const search = await page.evaluate(() => window.location.search);

      const params = new URLSearchParams(search);
      if (params.get("view") !== view) {
        throw new Error(`wrong view: '${params.get("view")}'`);
      }
    }

    try {
      await page.waitForSelector(
        `[data-cy=${
          withGrid ? "spotlight-section-forward" : "panel-container"
        }]`,
        {
          state: "visible",
        }
      );
    } catch (e) {
      if (isRetry) {
        throw e;
      } else {
        const ctx = page.context();
        ctx.clearCookies();
        ctx.clearPermissions();
        await page.reload({ waitUntil: "domcontentloaded" });
        await this.waitUntilGridVisible(page, datasetName, options, true);
      }
    }

    if (isEmptyDataset) {
      return;
    }

    await page.waitForFunction(
      () => {
        if (document.querySelector(`[data-cy=looker-error-info]`)) {
          return true;
        }

        return (
          document.querySelector(`canvas`)?.getAttribute("canvas-loaded") ===
          "true"
        );
      },
      {},
      { timeout: Duration.Seconds(10) }
    );
  }
}
