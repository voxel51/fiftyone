import { test as base } from "@playwright/test";
import { MediaFactory } from "src/shared/media-factory";
import { AbstractFiftyoneLoader } from "../../shared/abstract-loader";
import { OssLoader } from "./loader";

export type CustomFixtures = {
  fiftyoneLoader: AbstractFiftyoneLoader;
  fiftyoneServerPort: number;
  mediaFactory: typeof MediaFactory;
};

export const test = base.extend<{}, CustomFixtures>({
  fiftyoneServerPort: [
    async ({}, use, workerInfo) => {
      if (process.env.USE_DEV_BUILD) {
        await use(8787);
        return;
      }

      await use(3050 + workerInfo.workerIndex);
    },
    { scope: "worker" },
  ],
  fiftyoneLoader: [
    async ({ fiftyoneServerPort }, use) => {
      // setup
      const loader = new OssLoader();
      await loader.startWebServer(fiftyoneServerPort);

      // yield loader
      await use(loader);

      // teardown
      await loader.stopWebServer();
    },
    { scope: "worker" },
  ],
  mediaFactory: [
    async ({}, use) => {
      await use(MediaFactory);
    },
    { scope: "worker" },
  ],
  baseURL: async ({ fiftyoneServerPort }, use) => {
    if (process.env.USE_DEV_BUILD) {
      if (process.env.IS_UTILITY_DOCKER) {
        await use(`http://host.docker.internal:5193`);
        return;
      }

      await use(`http://localhost:${5193}`);
      return;
    }

    await use(`http://localhost:${fiftyoneServerPort}`);
  },
});

export { Locator, Page, expect } from "@playwright/test";
