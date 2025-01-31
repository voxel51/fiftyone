import { test as base } from "@playwright/test";
import { EventUtils } from "src/shared/event-utils";
import { MediaFactory } from "src/shared/media-factory";
import { AbstractFiftyoneLoader } from "../../shared/abstract-loader";
import { FoWebServer } from "./foServer";
import { OssLoader } from "./loader";

// note: this difference between "with" and "without" is only for type safety

// these fixtures do not have access to the {page} fixture
export type CustomFixturesWithoutPage = {
  fiftyoneLoader: AbstractFiftyoneLoader;
  fiftyoneServerPort: number;
  mediaFactory: typeof MediaFactory;
  foWebServer: FoWebServer;
};

// these fixtures have access to the {page} fixture
export type CustomFixturesWithPage = {
  eventUtils: EventUtils;
};

const customFixtures = base.extend<object, CustomFixturesWithoutPage>({
  fiftyoneServerPort: [
    async ({}, use, workerInfo) => {
      if (process.env.USE_DEV_BUILD?.toLocaleLowerCase() === "true") {
        await use(8787);
        return;
      }

      await use(3050 + workerInfo.workerIndex + workerInfo.parallelIndex);
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
  eventUtils: async ({ page }, use) => {
    await use(new EventUtils(page));
  },
  baseURL: async ({ fiftyoneServerPort }, use) => {
    if (process.env.USE_DEV_BUILD?.toLocaleLowerCase() === "true") {
      if (process.env.IS_UTILITY_DOCKER?.toLocaleLowerCase() === "true") {
        await use(`http://host.docker.internal:5193`);
        return;
      }

      await use(`http://localhost:${5193}`);
      return;
    }

    await use(`http://localhost:${fiftyoneServerPort}`);
  },
});

export { Browser, expect, Locator, Page } from "@playwright/test";
