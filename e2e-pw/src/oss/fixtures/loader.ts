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

const isModalVisible = async (page: Page) => {
  if (page.isClosed()) {
    return false;
  }

  return page.evaluate(() => {
    const modal = document.querySelector(
      "[data-cy='modal']"
    ) as HTMLElement | null;

    if (!modal) {
      return false;
    }

    const style = window.getComputedStyle(modal);
    if (style.display === "none" || style.visibility === "hidden") {
      return false;
    }

    if (Number(style.opacity) === 0 || style.pointerEvents === "none") {
      return false;
    }

    const rect = modal.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  });
};

const dismissModalIfPresent = async (page: Page) => {
  if (page.isClosed()) {
    return;
  }

  const currentUrl = page.url();
  if (!currentUrl || currentUrl === "about:blank") {
    return;
  }

  let hasModalIdInQuery = false;
  try {
    hasModalIdInQuery = new URL(currentUrl).searchParams.has("id");
  } catch {
    return;
  }

  const modalVisible = await isModalVisible(page);
  if (!hasModalIdInQuery && !modalVisible) {
    return;
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await page.click("body", {
        position: { x: 0, y: 0 },
        timeout: Duration.Seconds(2),
      });
    } catch {
      // modal may already be gone
    }

    try {
      await page.keyboard.press("Escape");
    } catch {
      // page may be transitioning
    }

    if (!(await isModalVisible(page))) {
      break;
    }
  }
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
    const { isEmptyDataset, searchParams, withGrid } = options ?? {
      isEmptyDataset: false,
      searchParams: undefined,
      withGrid: true,
    };
    const shouldPreserveModalFromUrl = Boolean(searchParams?.get("id"));

    await page.addInitScript(() => {
      let init = true;
      const handleCursorChange = (e: MouseEvent) => {
        const element = document.elementFromPoint(e.clientX, e.clientY);
        const cursor = window.getComputedStyle(element).cursor;
        // eslint-disable-next-line
        // @ts-ignore
        if (cursor !== window.CURRENT_CURSOR) {
          // eslint-disable-next-line
          // @ts-ignore
          window.CURRENT_CURSOR = window.getComputedStyle(element).cursor;
          document.dispatchEvent(new CustomEvent("cursor-change"));
        }
      };

      if (init) {
        init = false;
        document.addEventListener("mousemove", handleCursorChange);
      }

      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore injecting IS_PLAYWRIGHT into window so that
      // we can disable 1) analytics, and 2) QA performance toast banners
      window.IS_PLAYWRIGHT = true;

      // Clear modal mode state to ensure tests start in explore mode
      const keys = Object.keys(localStorage);
      keys.forEach((key) => {
        if (key.includes("modalMode")) {
          localStorage.removeItem(key);
        }
      });
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

    // Defensive cleanup for cross-test modal contamination.
    // Skip this when the caller intentionally opens a modal via ?id=...
    if (!shouldPreserveModalFromUrl) {
      await dismissModalIfPresent(page);
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

    // The modal can still animate in after initial dataset navigation settles.
    // Run a second defensive close pass unless this navigation explicitly requested a modal.
    if (!shouldPreserveModalFromUrl) {
      await dismissModalIfPresent(page);
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
