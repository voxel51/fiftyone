import { AbstractFiftyoneLoader } from "./abstract-loader";
import { test as base } from "@playwright/test";
import { loader } from "./loader";

export type MyFixtures = {
  fiftyoneLoader: AbstractFiftyoneLoader;
};

export const test = base.extend<MyFixtures>({
  fiftyoneLoader: async ({}, use) => {
    await use(loader);
  },
});

export { expect } from "@playwright/test";
