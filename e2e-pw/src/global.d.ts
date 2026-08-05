/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

/**
 * Playwright-injected globals written by the test loader via
 * `page.addInitScript`. Declared here so TypeScript knows about them without
 * needing `@ts-ignore` at each call site.
 */
interface Window {
  /** Guards the init script so it only runs once per page lifecycle. */
  __FO_PLAYWRIGHT_INIT__: boolean;

  /** Tracks the most recently observed CSS cursor value for cursor-change events. */
  __FO_PLAYWRIGHT_CURRENT_CURSOR: string;

  /**
   * Counts how many times the `GlobalLoadingScreenEvent` has fired.
   * Should be exactly 1 after initial page load; more than 1 indicates
   * a top-level Suspense regression.
   */
  __FO_PLAYWRIGHT_LOADING_SCREEN_COUNT: number;

  /** Disables analytics and QA performance toast banners during test runs. */
  IS_PLAYWRIGHT: boolean;
}
