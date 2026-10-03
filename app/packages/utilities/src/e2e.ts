/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

/** Whether the app is driven by browser automation (e2e), not a real user. */
export const isE2E = (): boolean =>
  typeof navigator !== "undefined" && navigator.webdriver === true;
