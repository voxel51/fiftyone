import { Page, expect } from "src/oss/fixtures";
import type { EventUtils } from "src/shared/event-utils";
import { TooltipPom } from "./tooltip";

export enum SampleCanvasType {
  LIGHTER = "lighter-sample-renderer",
  LOOKER = "modal-looker-container",
  LOOKER3D = "looker3d",
}

/**
 * The canvas of the sample plugin in the modal. Applies to image, video and 3D
 * media types.
 *
 * All operations use relative [0, 1] coordinates with respect to container,
 * and not the media within it.
 */
export class SampleCanvasPom {
  readonly assert: SampleCanvasAsserter;

  constructor(readonly page: Page, readonly eventUtils: EventUtils) {
    this.assert = new SampleCanvasAsserter(this);
  }

  /**
   * The sample canvas locator
   */
  get locator() {
    return this.page.getByTestId("panel-content-fo-sample-modal-plugin");
  }

  /**
   * The tooltip, if present
   */
  get tooltip() {
    return new TooltipPom(this.page, this.eventUtils);
  }

  /**
   * Get the current mouse cursor style
   */
  get cursor(): Promise<string> {
    // eslint-disable-next-line
    // @ts-ignore
    return this.page.evaluate(() => window.CURRENT_CURSOR);
  }

  /**
   * Mouse click on the sample canvas
   *
   * @param x The x coordinate between [0, 1]
   * @param y The y coordinate between [0, 1]
   */
  async click(x: number, y: number) {
    const xy = await this.#toScreenCoordinates(x, y);
    await this.page.mouse.click(xy.x, xy.y);
  }

  /**
   * Mouse double click on the sample canvas
   *
   * @param x The x coordinate between [0, 1]
   * @param y The y coordinate between [0, 1]
   */
  async dblclick(x: number, y: number) {
    const xy = await this.#toScreenCoordinates(x, y);
    await this.page.mouse.dblclick(xy.x, xy.y);
  }

  /**
   * Mouse down on the sample canvas
   */
  async down() {
    await this.page.mouse.down();
  }

  /**
   * Mouse move on the sample canvas
   *
   * @param x The x coordinate between [0, 1]
   * @param y The y coordinate between [0, 1]
   * @param cursor An optional cursor value to expect after moving
   */
  async move(x: number, y: number, cursor?: string) {
    const xy = await this.#toScreenCoordinates(x, y);
    await this.page.mouse.move(xy.x, xy.y);
    if (cursor) {
      await this.assert.hasCursor(cursor);
    }
  }

  /**
   * Mouse up on the sample canvas
   */
  async up() {
    await this.page.mouse.up();
  }

  /**
   * Wait for the cursor to change
   */
  async waitForCursorChange() {
    await this.eventUtils.getEventReceivedPromiseForPredicate("cursor-change");
  }

  async #toScreenCoordinates(x: number, y: number) {
    const box = await this.locator.boundingBox();

    const xPixels = x * box.width;
    const yPixels = y * box.height;

    return {
      x: box.x + xPixels,
      y: box.y + yPixels,
    };
  }
}

/**
 * Sample canvas asserter
 */
class SampleCanvasAsserter {
  constructor(private readonly sampleCanvasPom: SampleCanvasPom) {}

  /**
   * Does mouse have this cursor style
   *
   * @param name the cursor style
   */
  async hasCursor(cursor: string) {
    const value = await this.sampleCanvasPom.cursor;
    return expect(value).toBe(cursor);
  }

  /**
   * Does the current sample match this screenshot
   *
   * @param name the name of the screenshot
   */
  async hasScreenshot(name: string) {
    if (
      await this.sampleCanvasPom.page
        .getByTestId("sample-canvas-checkbox")
        .isVisible()
    ) {
      // Hide controls before checking the screenshot
      await this.sampleCanvasPom.page.keyboard.press("c");
    }

    //   await this.sampleCanvasPom.tooltip.assert.isVisible(false);
    return await expect(this.sampleCanvasPom.locator).toHaveScreenshot(name);
  }

  /**
   * Does the {@link SampleCanvasType} match
   *
   * @param name The sample canvas type, e.g. "lighter"
   */
  is(type: SampleCanvasType) {
    return expect(this.sampleCanvasPom.locator.getByTestId(type)).toBeVisible();
  }
}

export default SampleCanvasPom;
