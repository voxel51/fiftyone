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
  /** the page fixture's count of global loading screens per document */

  /** The CSS cursor under the pointer, updated on every pointer move. */
  __FO_PLAYWRIGHT_CURRENT_CURSOR: string;
}
