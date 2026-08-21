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
   * Published by the image Lighter surface (`useExposeMediaBoundsForTest`):
   * the canonical media's live screen bounds in page coordinates, or `null`
   * before the media mounts. Absent outside the image annotate surface.
   */
  __FO_PLAYWRIGHT_MEDIA_SCREEN_BOUNDS?: () => {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;

  /** Disables analytics and QA performance toast banners during test runs. */
  IS_PLAYWRIGHT: boolean;
}
