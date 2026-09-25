import { Page } from "@playwright/test";
import { getPythonCommand, getStringifiedKwargs } from "src/oss/utils/commands";
import {
  AbstractFiftyoneLoader,
  WaitUntilGridVisibleOptions,
} from "src/shared/abstract-loader";
import { PythonRunner } from "src/shared/python-runner/python-runner";

export class OssLoader extends AbstractFiftyoneLoader {
  constructor() {
    super();
    this.pythonRunner = new PythonRunner(getPythonCommand);
  }

  async loadZooDataset(
    zooDatasetName: string,
    id: string,
    kwargs: Record<string, string> = {},
  ) {
    const kwargsStringified = getStringifiedKwargs(kwargs);

    return this.pythonRunner.exec(`
      import fcntl
      import os

      import fiftyone as fo
      import fiftyone.zoo as foz

      # parallel workers share the zoo download cache; an exclusive lock per
      # dataset serializes the download, after which loads are cache hits
      os.makedirs(fo.config.dataset_zoo_dir, exist_ok=True)
      lock_path = os.path.join(
        fo.config.dataset_zoo_dir, ".${zooDatasetName}.lock"
      )
      with open(lock_path, "w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
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
  ): Promise<void> {
    const { isEmptyDataset, readySelector, searchParams, withGrid } =
      options ?? {
        isEmptyDataset: false,
        readySelector: undefined,
        searchParams: undefined,
        withGrid: true,
      };

    await page.addInitScript(() => {
      if (window.__FO_PLAYWRIGHT_INIT__) {
        return;
      }

      window.__FO_PLAYWRIGHT_INIT__ = true;

      if (!window.name.includes("__FO_PLAYWRIGHT_STORAGE_CLEARED__")) {
        window.localStorage.clear();
        window.sessionStorage.clear();
        window.name = `${window.name}__FO_PLAYWRIGHT_STORAGE_CLEARED__`;
      }

      const handleCursorChange = (e: MouseEvent) => {
        const element = document.elementFromPoint(e.clientX, e.clientY);
        // elementFromPoint may return null (e.g. pointer outside the
        // viewport); a throw here would silently freeze the cursor flag
        // at its previous value
        if (!element) {
          return;
        }
        const cursor = window.getComputedStyle(element).cursor;
        window.__FO_PLAYWRIGHT_CURRENT_CURSOR = cursor;
      };

      document.addEventListener("mousemove", handleCursorChange);
      document.addEventListener("mousemove", handleCursorChange);
      document.addEventListener("pointerdown", handleCursorChange);
      document.addEventListener("pointerup", handleCursorChange);

      // log-visibility watchdog for every spec; specs asserting on loading
      // screen counts arm an EventUtils.initCounter for
      // "global-loading-screen" instead
      let loadingScreens = 0;
      document.addEventListener("global-loading-screen", () => {
        loadingScreens += 1;
        if (loadingScreens > 1) {
          throw new Error(
            "Global loading screen fired more than once — top-level Suspense boundary re-activated after initial page load",
          );
        }
      });

      window.IS_PLAYWRIGHT = true;
    });

    const forceDatasetFromSelector = async () => {
      await page.goto("/", { waitUntil: "domcontentloaded" });
      await page.getByTestId("selector-dataset").click();

      if (datasetName) {
        await page.getByTestId(`selector-result-${datasetName}`).click();
      } else {
        const firstSelectorResult = page.locator(
          "[data-cy=selector-results-container] > div",
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

    await page
      .locator(
        `[data-cy=${withGrid ? "spotlight-section-forward" : "panel-container"}]`,
      )
      .first()
      .waitFor({ state: "attached" });

    if (isEmptyDataset) {
      return;
    }

    if (readySelector) {
      await page.locator(readySelector).first().waitFor({ state: "attached" });
      return;
    }

    // a grid tile's terminal state depends on its kind: lookers finish
    // drawing a canvas (or report an error); custom-renderer tiles are
    // ready once their wrapper commits
    await page
      .locator(
        '[data-cy=looker-error-info], [data-cy=grid-custom-renderer], canvas[canvas-loaded="true"]',
      )
      .first()
      .waitFor({ state: "attached" });
  }
}
