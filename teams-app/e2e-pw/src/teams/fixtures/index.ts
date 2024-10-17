// import { test as base } from '@playwright/test';
// import { AbstractFiftyoneLoader } from 'oss/shared/abstract-loader';
// import { EventUtils } from 'oss/shared/event-utils';
// import { MediaFactory } from 'oss/shared/media-factory';
// import { TeamsLoader } from './loader';

// // these fixtures do not have access to the {page} fixture
// export type CustomFixturesWithoutPage = {
//   fiftyoneLoader: AbstractFiftyoneLoader;
//   mediaFactory: typeof MediaFactory;
// };

// // these fixtures have access to the {page} fixture
// export type CustomFixturesWithPage = {
//   eventUtils: EventUtils;
// };

// const customFixtures = base.extend<object, CustomFixturesWithoutPage>({
//   fiftyoneLoader: [
//     async ({}, use) => {
//       const loader = new TeamsLoader();
//       await use(loader);
//     },
//     { scope: 'worker' }
//   ],
//   mediaFactory: [
//     async ({}, use) => {
//       await use(MediaFactory);
//     },
//     { scope: 'worker' }
//   ]
// });

// export const test = customFixtures.extend<CustomFixturesWithPage>({
//   eventUtils: async ({ page }, use) => {
//     await use(new EventUtils(page));
//   }
// });

// export { Locator, Page, expect } from '@playwright/test';
