import { test as base } from "@playwright/test";
import { AbstractFiftyoneLoader } from "../../shared/abstract-loader";
import { OssLoader } from "./loader";

// const newPort = (workerIndex: number) => {
//   const port = 3050 + workerIndex;
//   return port;
// };

export type MyFixtures = {
  fiftyoneLoader: AbstractFiftyoneLoader;
  fiftyoneServerPort: number;
};

export const test = base.extend<{}, MyFixtures>({
  fiftyoneServerPort: [
    async ({}, use, workerInfo) => {
      console.log("worker index is ", workerInfo.workerIndex);
      await use(3050 + workerInfo.workerIndex);
    },
    { scope: "worker" },
  ],
  fiftyoneLoader: [
    // async ({}, use) => {
    async ({ fiftyoneServerPort }, use) => {
      // setup
      const loader = new OssLoader();

      await loader.startWebServer(fiftyoneServerPort);
      // yield loader
      await use(loader);

      await loader.stopWebServer();

      // teardown
      // console.log("Stopping server...");
      // await loader.stopWebServer();
      // console.log("Server stopped");
    },
    { scope: "worker" },
  ],
  baseURL: async ({ fiftyoneServerPort }, use) => {
    await use(`http://localhost:${fiftyoneServerPort}`);
  },
});

// test.beforeAll(async ({ fiftyoneLoader, fiftyoneServerPort }) => {
//   await fiftyoneLoader.startWebServer(fiftyoneServerPort);
// });

// test.afterAll(async ({ fiftyoneLoader, page }) => {
//   await fiftyoneLoader.stopWebServer();
// });

export { Locator, Page, expect } from "@playwright/test";
