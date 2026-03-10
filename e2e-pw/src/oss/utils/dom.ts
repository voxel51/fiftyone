import { Page } from "src/oss/fixtures";

/**
 * Checks whether the element visually on top at the given screen coordinates
 * is part of the target element (matched by a CSS selector).
 *
 * Useful for asserting z-index stacking order - e.g. that a modal overlay
 * is visually covering some other element.
 *
 * @param page The Playwright page
 * @param coords The screen coordinates to sample
 * @param targetSelector A CSS selector for the expected covering element
 */
export async function isElementCoveredBy(
  page: Page,
  coords: { x: number; y: number },
  targetSelector: string
): Promise<boolean> {
  return page.evaluate(
    ({ x, y, selector }) => {
      const el = document.elementFromPoint(x, y);
      return el?.closest(selector) !== null || el?.matches(selector) === true;
    },
    { x: coords.x, y: coords.y, selector: targetSelector }
  );
}
