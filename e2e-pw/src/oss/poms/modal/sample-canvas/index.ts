import { Mouse } from "@playwright/test";
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
  get cursor(): string {
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
    await this.#callMouse("click", x, y);
  }

  /**
   * Mouse double click on the sample canvas
   *
   * @param x The x coordinate between [0, 1]
   * @param y The y coordinate between [0, 1]
   */
  async dblclick(x: number, y: number) {
    await this.#callMouse("dblclick", x, y);
  }

  /**
   * Mouse down on the sample canvas
   *
   * @param x The x coordinate between [0, 1]
   * @param y The y coordinate between [0, 1]
   */
  async down(x: number, y: number) {
    await this.#callMouse("down", x, y);
  }

  /**
   * Mouse move on the sample canvas
   *
   * @param x The x coordinate between [0, 1]
   * @param y The y coordinate between [0, 1]
   */
  async move(x: number, y: number) {
    await this.#callMouse("move", x, y);
  }

  /**
   * Mouse up on the sample canvas
   *
   * @param x The x coordinate between [0, 1]
   * @param y The y coordinate between [0, 1]
   */
  async up(x: number, y: number) {
    await this.#callMouse("up", x, y);
  }

  async #callMouse(method: keyof Mouse, x: number, y: number) {
    const xy = await this.#toScreenCoordinates(x, y);
    await this.page.mouse[method](xy.x, xy.y);
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
  hasCursor(cursor: string) {
    return expect(this.sampleCanvasPom.cursor).toBe(cursor);
  }

  /**
   * Does the current sample match this screenshot
   *
   * @param name the name of the screenshot
   */
  hasScreenshot(name: string) {
    return expect(this.sampleCanvasPom.locator).toHaveScreenshot(name);
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
