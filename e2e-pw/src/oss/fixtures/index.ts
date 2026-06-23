import { test as base } from "@playwright/test";
import { DatasetFactory } from "src/shared/dataset-factory";
import { EventUtils } from "src/shared/event-utils";
import { MediaFactory } from "src/shared/media-factory";
import { AbstractFiftyoneLoader } from "../../shared/abstract-loader";
import { AggregationWatcher } from "./aggregation-watcher";
import { AnnotateSDK } from "./annotate-sdk";
import { FoWebServer } from "./fo-server";
import { OssLoader } from "./loader";
import { VideoAnnotateSDK } from "./video-annotate-sdk";

// note: this difference between "with" and "without" is only for type safety

// these fixtures do not have access to the {page} fixture
export type CustomFixturesWithoutPage = {
  fiftyoneLoader: AbstractFiftyoneLoader;
  fiftyoneServerPort: number;
  datasetFactory: typeof DatasetFactory;
  mediaFactory: typeof MediaFactory;
  foWebServer: FoWebServer;
  annotateSDK: AnnotateSDK;
  videoAnnotateSDK: VideoAnnotateSDK;
};

// these fixtures have access to the {page} fixture
export type CustomFixturesWithPage = {
  eventUtils: EventUtils;
  aggregationWatcher: AggregationWatcher;
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

      // random number [0, 99] to avoid port collisions (rare edge case)
      const rand = Math.floor(Math.random() * 100);

      await use(
        3050 + workerInfo.workerIndex + workerInfo.parallelIndex + rand
      );
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
  annotateSDK: [
    async ({}, use) => {
      await use(new AnnotateSDK());
    },
    { scope: "worker" },
  ],
  videoAnnotateSDK: [
    async ({}, use) => {
      await use(new VideoAnnotateSDK());
    },
    { scope: "worker" },
  ],
});

export const test = customFixtures.extend<CustomFixturesWithPage>({
  eventUtils: async ({ page }, use) => {
    await use(new EventUtils(page));
  },
  aggregationWatcher: async ({ page }, use) => {
    await use(new AggregationWatcher(page));
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
