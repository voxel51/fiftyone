import { test as base, type BrowserContext, type Page } from "@playwright/test";
import { DatasetFactory } from "src/shared/dataset-factory";
import { EventUtils } from "src/shared/event-utils";
import { MediaFactory } from "src/shared/media-factory";
import { reserveWorkerPort } from "src/shared/network-utils/port";
import { installSam2MockWorker } from "src/shared/sam2-mock-worker";
import { AbstractFiftyoneLoader } from "../../shared/abstract-loader";
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
  /**
   * Opens a page in a fresh browser context, for checking what persisted
   * through a true server round-trip. Every page the test opened before it
   * closes first: an App open alongside would share the server's session and
   * sync its state into the check.
   */
  openFreshPage: () => Promise<Page>;
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
  eventUtils: [
    async ({ page }, use, testInfo) => {
      const eventUtils = new EventUtils(page);
      await eventUtils.recordLoads();
      // each document shows the global loading screen at most once
      const loadingScreens = await eventUtils.countPerDocument(
        "e2e:app:global-loading-screen",
      );
      await use(eventUtils);
      if (Math.max(0, ...loadingScreens()) > 1) {
        throw new Error(
          "the top-level Suspense boundary re-activated after the page loaded",
        );
      }
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
    { auto: true },
  ],
  openFreshPage: async ({ browser, page }, use) => {
    const pages: Page[] = [page];
    const contexts: BrowserContext[] = [];
    await use(async () => {
      for (const open of pages) await open.close();
      const context = await browser.newContext();
      contexts.push(context);
      const fresh = await context.newPage();
      pages.push(fresh);
      return fresh;
    });
    for (const context of contexts) await context.close();
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
