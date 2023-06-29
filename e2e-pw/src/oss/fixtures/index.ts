import { test as base } from "@playwright/test";
import { AbstractFiftyoneLoader } from "../../shared/abstract-loader";
import { OssLoader } from "./loader";

export type MyFixtures = {
  fiftyoneLoader: AbstractFiftyoneLoader;
};

export const test = base.extend<MyFixtures>({
  fiftyoneLoader: async ({}, use) => {
    await use(new OssLoader());
  },
});

export { Locator, Page, expect } from "@playwright/test";
