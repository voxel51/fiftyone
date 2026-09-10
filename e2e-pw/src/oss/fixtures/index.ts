import { test as base } from "@playwright/test";
import { DatasetFactory } from "src/shared/dataset-factory";
import { EventUtils } from "src/shared/event-utils";
import { MediaFactory } from "src/shared/media-factory";
import { reserveWorkerPort } from "src/shared/network-utils/port";
import { installSam2MockWorker } from "src/shared/sam2-mock-worker";
import { AbstractFiftyoneLoader } from "../../shared/abstract-loader";
import { AggregationWatcher } from "./aggregation-watcher";
import { FoWebServer } from "./fo-server";
import { OssLoader } from "./loader";

// note: this difference between "with" and "without" is only for type safety

// these fixtures do not have access to the {page} fixture
export type CustomFixturesWithoutPage = {
  fiftyoneLoader: AbstractFiftyoneLoader;
  fiftyoneServerPort: number;
  datasetFactory: typeof DatasetFactory;
  mediaFactory: typeof MediaFactory;
  foWebServer: FoWebServer;
};

// these fixtures have access to the {page} fixture
export type CustomFixturesWithPage = {
  eventUtils: EventUtils;
  aggregationWatcher: AggregationWatcher;
  /**
   * Installs a deterministic mock SAM2 worker via `page.addInitScript` so
   * the page's `BrowserAnnotationProvider` constructs the mock instead of
   * the real WebAssembly worker. Auto-runs when destructured; no value to
   * use directly.
   */
  mockSam2Worker: void;
};

const customFixtures = base.extend<object, CustomFixturesWithoutPage>({
  datasetFactory: [
    async ({}, use) => {
      await use(DatasetFactory);
    },
    { scope: "worker" },
  ],
  fiftyoneServerPort: [
    async ({}, use, workerInfo) => {
      if (process.env.USE_DEV_BUILD?.toLocaleLowerCase() === "true") {
        await use(8787);
        return;
      }

      await use(await reserveWorkerPort(workerInfo.parallelIndex));
    },
    { scope: "worker" },
  ],
  fiftyoneLoader: [
    async ({}, use) => {
      await use(new OssLoader());
    },
    { scope: "worker" },
  ],
  mediaFactory: [
    async ({}, use) => {
      await use(MediaFactory);
    },
    { scope: "worker" },
  ],
  foWebServer: [
    async ({ fiftyoneServerPort }, use) => {
      await use(new FoWebServer(fiftyoneServerPort));
    },
    { scope: "worker" },
  ],
});

export const test = customFixtures.extend<CustomFixturesWithPage>({
  page: async ({ page }, use, testInfo) => {
    page.on("pageerror", (e) => {
      console.error(`[pageerror] ${testInfo.title}: ${e.message}`);
    });
    page.on("console", (message) => {
      if (message.type() === "error") {
        console.error(`[browser-error] ${testInfo.title}: ${message.text()}`);
      }
    });
    await use(page);
  },
  eventUtils: async ({ page }, use) => {
    await use(new EventUtils(page));
  },
  aggregationWatcher: async ({ page }, use) => {
    await use(new AggregationWatcher(page));
  },
  mockSam2Worker: async ({ page }, use) => {
    await installSam2MockWorker(page);
    await use();
  },
  baseURL: async ({ fiftyoneServerPort }, use) => {
    if (process.env.USE_DEV_BUILD?.toLocaleLowerCase() === "true") {
      if (process.env.IS_UTILITY_DOCKER?.toLocaleLowerCase() === "true") {
        await use(`http://host.docker.internal:5193`);
        return;
      }

      await use(
        `http://localhost:${process.env.FIFTYONE_DEFAULT_APP_PORT ?? 5193}`,
      );
      return;
    }

    await use(`http://localhost:${fiftyoneServerPort}`);
  },
});

export { Browser, expect, Locator, Page } from "@playwright/test";
