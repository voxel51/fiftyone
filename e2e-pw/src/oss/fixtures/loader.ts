import { Page } from "@playwright/test";
import { spawn } from "child_process";
import { getPythonCommand, getStringifiedKwargs } from "src/oss/utils/commands";
import { AbstractFiftyoneLoader } from "src/shared/abstract-loader";
import { PythonRunner } from "src/shared/python-runner/python-runner";
import kill from "tree-kill";
import waitOn from "wait-on";
import { Duration } from "../utils";

export class OssLoader extends AbstractFiftyoneLoader {
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

    const procString = getPythonCommand([
      "../fiftyone/server/main.py",
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
        console.log("webserver failed to start");
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

    return this.pythonRunner.exec(
      `
      import fiftyone as fo
      import fiftyone.zoo as foz

      quickstart_groups_dataset = foz.load_zoo_dataset(
        "${zooDatasetName}", dataset_name="${id}"${kwargsStringified}
      )
      quickstart_groups_dataset.persistent = True
    `
    );
  }

  async loadTestDataset(name: string) {
    throw new Error("Method not implemented.");
  }

  async executePythonCode(code: string) {
    return this.pythonRunner.exec(code);
  }

  async executePythonFixture(fixturePath: string) {
    throw new Error("Method not implemented.");
  }

  async waitUntilLoad(page: Page, datasetName: string) {
    const forceDatasetFromSelector = async () => {
      await page.goto("/");
      await page.getByTestId(`selector-Select dataset`).click();

      if (datasetName) {
        console.log("attempting to click", `selector-result-${datasetName}`);
        await page.getByTestId(`selector-result-${datasetName}`).click();
      } else {
        const firstSelectorResult = page.locator(
          "[data-cy=selector-results-container] > div"
        );
        await firstSelectorResult.click();
      }
    };

    if (!datasetName) {
      await forceDatasetFromSelector();
    } else {
      await page.goto(`/datasets/${datasetName}`);
      const location = await page.evaluate(() => window.location.href);

      if (!location.includes("datasets")) {
        await forceDatasetFromSelector();
      }
    }

    await page.waitForSelector("[data-cy=flashlight-section]", {
      state: "visible",
    });
  }
}
