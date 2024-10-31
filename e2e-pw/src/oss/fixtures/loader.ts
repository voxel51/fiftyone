import { Page } from "@playwright/test";
import { spawn } from "child_process";
import { getPythonCommand, getStringifiedKwargs } from "src/oss/utils/commands";
import {
  AbstractFiftyoneLoader,
  WaitUntilGridVisibleOptions,
} from "src/shared/abstract-loader";
import { PythonRunner } from "src/shared/python-runner/python-runner";
import kill from "tree-kill";
import waitOn from "wait-on";
import { POPUP_DISMISS_TIMEOUT } from "../constants";
import { Duration } from "../utils";

type WebServerProcessConfig = {
  port: number;
  processId: number;
};
export class OssLoader extends AbstractFiftyoneLoader {
  protected webserverProcessConfig: WebServerProcessConfig;

  constructor() {
    super();
    this.pythonRunner = new PythonRunner(getPythonCommand);
  }

  async startWebServer(port: number) {
    if (!port) {
      throw new Error("port is required");
    }

    console.log("starting webserver on port", port);

    process.env.FIFTYONE_DATABASE_NAME = `${process.env.FIFTYONE_DATABASE_NAME}-${port}`;

    const mainPyPath = process.env.FIFTYONE_ROOT_DIR
      ? `${process.env.FIFTYONE_ROOT_DIR}/fiftyone/server/main.py`
      : "../fiftyone/server/main.py";

    const procString = getPythonCommand([
      mainPyPath,
      "--address",
      "0.0.0.0",
      "--port",
      port.toString(),
      "--clean_start",
    ]);

    const proc = spawn(procString, { shell: true });
    proc.stdout.pipe(process.stdout);
    proc.stderr.pipe(process.stderr);

    this.webserverProcessConfig = {
      port,
      processId: proc.pid,
    };

    console.log(
      `waiting for webserver (procId = ${proc.pid}) to start on port ${port}...`
    );

    return waitOn({
      resources: [`http://0.0.0.0:${port}`],
      timeout: Duration.Seconds(30),
    })
      .then(() => {
        console.log("webserver started");
      })
      .catch((err) => {
        console.log("webserver failed to start, err = ", err);
        throw err;
      });
  }

  async stopWebServer() {
    if (!this.webserverProcessConfig.processId) {
      throw new Error("webserver process not started");
    }

    return new Promise<void>((resolve, reject) => {
      kill(this.webserverProcessConfig.processId, "SIGTERM", (err) => {
        if (err) {
          reject(err);
        }

        console.log("webserver stopped");
        resolve();
      });
    });
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

  async waitUntilGridVisible(
    page: Page,
    datasetName: string,
    options?: WaitUntilGridVisibleOptions
  ) {
    const { isEmptyDataset, searchParams, withGrid } = options ?? {
      isEmptyDataset: false,
      searchParams: undefined,
      withGrid: true,
    };

    const forceDatasetFromSelector = async () => {
      await page.goto("/");
      await page.getByTestId("selector-Select dataset").click();

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
      await page.goto(`/datasets/${datasetName}?${search}`);
    } else {
      await page.goto(`/datasets/${datasetName}`);
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

    await page.waitForSelector(
      `[data-cy=${withGrid ? "spotlight-section-forward" : "panel-container"}]`,
      {
        state: "visible",
      }
    );

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

    // close all pop-ups (cookies, new feature annoucement, etc.)
    try {
      await page
        .getByTestId("btn-dismiss-query-performance-toast")
        .click({ timeout: POPUP_DISMISS_TIMEOUT });
    } catch {
      console.log("No query performance toast to dismiss");
    }

    try {
      await page
        .getByTestId("btn-disable-cookies")
        .click({ timeout: POPUP_DISMISS_TIMEOUT });
    } catch {
      console.log("No cookies button to disable");
    }
  }
}
