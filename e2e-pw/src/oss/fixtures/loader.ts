import { Page } from "@playwright/test";
import { getPythonCommand, getStringifiedKwargs } from "src/oss/utils/commands";
import {
  AbstractFiftyoneLoader,
  WaitUntilGridVisibleOptions,
} from "src/shared/abstract-loader";
import { PythonRunner } from "src/shared/python-runner/python-runner";
import { Duration } from "../utils";

const clearPersistedBrowserState = async (page: Page) => {
  if (page.isClosed()) {
    return;
  }

  await page.evaluate(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
};

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
  ): Promise<void> {
    const { isEmptyDataset, readySelector, searchParams, withGrid } =
      options ?? {
        isEmptyDataset: false,
        readySelector: undefined,
        searchParams: undefined,
        withGrid: true,
      };

    await page.addInitScript(() => {
      // eslint-disable-next-line
      // @ts-ignore storing a page-global init flag on window for Playwright
      if (window.__FO_PLAYWRIGHT_INIT__) {
        return;
      }

      // eslint-disable-next-line
      // @ts-ignore storing a page-global init flag on window for Playwright
      window.__FO_PLAYWRIGHT_INIT__ = true;

      if (!window.name.includes("__FO_PLAYWRIGHT_STORAGE_CLEARED__")) {
        window.localStorage.clear();
        window.sessionStorage.clear();
        window.name = `${window.name}__FO_PLAYWRIGHT_STORAGE_CLEARED__`;
      }

      const handleCursorChange = (e: MouseEvent) => {
        const element = document.elementFromPoint(e.clientX, e.clientY);
        const cursor = window.getComputedStyle(element).cursor;
        // eslint-disable-next-line
        // @ts-ignore
        if (cursor !== window.__FO_PLAYWRIGHT_CURRENT_CURSOR) {
          // eslint-disable-next-line
          // @ts-ignore
          window.__FO_PLAYWRIGHT_CURRENT_CURSOR =
            window.getComputedStyle(element).cursor;
          document.dispatchEvent(new CustomEvent("cursor-change"));
        }
      };

      document.addEventListener("mousemove", handleCursorChange);
      document.addEventListener("mousemove", handleCursorChange);
      document.addEventListener("pointerdown", handleCursorChange);
      document.addEventListener("pointerup", handleCursorChange);

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
        if (page.isClosed()) {
          throw e;
        }

        try {
          const ctx = page.context();
          await ctx.clearCookies();
          await ctx.clearPermissions();
          await clearPersistedBrowserState(page);

          if (page.isClosed()) {
            throw e;
          }

          await page.reload({ waitUntil: "domcontentloaded" });
        } catch (cleanupError) {
          if (page.isClosed()) {
            throw e;
          }

          throw cleanupError;
        }

        return this.waitUntilGridVisible(page, datasetName, options, true);
      }
    }

    if (isEmptyDataset) {
      return;
    }

    if (readySelector) {
      await page.waitForSelector(readySelector, {
        state: "visible",
        timeout: Duration.Seconds(10),
      });
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
