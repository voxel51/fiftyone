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
    // global loading screens per document, reported by the loader's watchdog
    const loadingScreens = new Map<string, number>();
    await page.exposeBinding(
      "__FO_GLOBAL_LOADING_SCREEN__",
      (_source, documentId: string) => {
        loadingScreens.set(
          documentId,
          (loadingScreens.get(documentId) ?? 0) + 1,
        );
      },
    );
    await use(page);
    if (Math.max(0, ...loadingScreens.values()) > 1) {
      throw new Error(
        "the top-level Suspense boundary re-activated after the page loaded",
      );
    }
  },
  eventUtils: async ({ page }, use, testInfo) => {
    const eventUtils = new EventUtils(page);
    await eventUtils.recordLoads();
    await use(eventUtils);
    // a missing event fails as a bare timeout; say which events were expected
    if (testInfo.status !== testInfo.expectedStatus) {
      const report = await eventUtils.describePending();
      if (report) {
        console.log(`pending events:\n${report}`);
        await testInfo.attach("pending events", {
          body: report,
          contentType: "text/plain",
        });
      }
    }
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

      // 127.0.0.1, not localhost: the servers bind IPv4, and on hosts where
      // localhost resolves to ::1 first (macOS) the browser can fail the
      // IPv6 attempt without falling back. The startup health check already
      // probes 127.0.0.1 — navigation should match it.
      await use(
        `http://127.0.0.1:${process.env.FIFTYONE_DEFAULT_APP_PORT ?? 5193}`,
      );
      return;
    }

    await use(`http://127.0.0.1:${fiftyoneServerPort}`);
  },
});

export { Browser, expect, Locator, Page } from "@playwright/test";
