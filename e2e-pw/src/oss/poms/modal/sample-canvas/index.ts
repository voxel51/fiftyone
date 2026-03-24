import { Page, expect } from "src/oss/fixtures";
import type { EventUtils } from "src/shared/event-utils";
import { ToolbarPom } from "./toolbar";
import { TooltipPom } from "./tooltip";

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

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
  #box?: Box;

  constructor(readonly page: Page, readonly eventUtils: EventUtils) {
    this.assert = new SampleCanvasAsserter(this);
  }

  /**
   * The sample canvas locator
   */
  get locator() {
    return this.page.getByTestId("sample-canvas");
  }

  /**
   * The tooltip, if present
   */
  get tooltip() {
    return new TooltipPom(this.page, this.eventUtils);
  }

  /**
   * The Lighter toolbar (annotate mode), if present
   */
  get toolbar() {
    return new ToolbarPom(this.page, this.eventUtils);
  }

  /**
   * The top-left checkbox, if present
   */
  get checkbox() {
    return this.page.getByTestId("sample-canvas-checkbox");
  }

  /**
   * The current mouse cursor style, e.g. "grab" or "pointer"
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

  /**
   * Move the mouse to the right edge of the viewport (e.g. to avoid tooltips in
   * screenshots).
   */
  async moveMouseToViewportEdge() {
    const viewport = this.page.viewportSize();
    if (viewport) {
      await this.page.mouse.move(viewport.width - 1, viewport.height / 2);
    }
  }

  /**
   * Drag the canvas center by a known pixel offset to pan the viewport.
   *
   * A rightward drag adds +N to panX; a downward drag adds +N to panY.
   *
   * @param direction The direction to pan
   * @param offsetPixels How many pixels to drag
   */
  async pan(
    direction: "left" | "right" | "up" | "down",
    offsetPixels: number
  ) {
    const box = await this.locator.boundingBox();
    if (!box) {
      throw new Error("Canvas bounding box not available");
    }
    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;

    let endX = startX;
    let endY = startY;

    switch (direction) {
      case "left":
        endX -= offsetPixels;
        break;
      case "right":
        endX += offsetPixels;
        break;
      case "up":
        endY -= offsetPixels;
        break;
      case "down":
        endY += offsetPixels;
        break;
    }

    await this.page.mouse.move(startX, startY);
    await this.page.mouse.down();
    await this.page.mouse.move(endX, endY, { steps: 10 });
    await this.page.mouse.up();
  }

  /**
   * Zoom the canvas by scrolling the mouse wheel at the canvas center.
   * @param deltaY The wheel scroll delta (negative = zoom in, positive = zoom out)
   */
  async zoom(deltaY: number) {
    const box = await this.locator.boundingBox();
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await this.page.mouse.move(cx, cy);
    await this.page.mouse.wheel(0, deltaY);
  }

  /**
   * Capture a clean screenshot of the sample canvas.
   * Moves the cursor to the canvas center and optionally holds Shift so
   * renderers hide annotation overlays before snapping the screenshot.
   * @param hideOverlays Whether to hold Shift to suppress annotation overlays
   */
  async screenshot(hideOverlays = false): Promise<Buffer> {
    const box = await this.locator.boundingBox();
    await this.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);

    if (hideOverlays) {
      await this.page.keyboard.down("Shift");
    }

    // Target only the raw <canvas> element (Looker or Lighter) to avoid
    // capturing HTML overlays (checkbox, controls) that aren't part of the
    // rendered image and can be in different visibility states between shots.
    const lookerCanvas = this.page.locator(
      `[data-cy=${SampleCanvasType.LOOKER}] canvas`
    );
    const lighterCanvas = this.page.locator(
      `[data-cy=${SampleCanvasType.LIGHTER}] canvas`
    );
    const target =
      (await lookerCanvas.count()) > 0 ? lookerCanvas : lighterCanvas;

    const buf = Buffer.from(await target.screenshot());
    if (hideOverlays) await this.page.keyboard.up("Shift");
    return buf;
  }

  async #toScreenCoordinates(x: number, y: number) {
    if (!this.#box) {
      this.#box = await this.locator.boundingBox();
    }

    const box = this.#box;
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
  constructor(private readonly sampleCanvasPom: SampleCanvasPom) { }

  /**
   * Does the mouse have this cursor style
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
    await expect(this.sampleCanvasPom.checkbox).toBeHidden();
    await this.sampleCanvasPom.tooltip.assert.isVisible(false);
    await this.sampleCanvasPom.moveMouseToViewportEdge();
    await this.sampleCanvasPom.toolbar.assert.isVisible(false);
    await expect(this.sampleCanvasPom.locator).toBeVisible();
    await expect(this.sampleCanvasPom.locator).toHaveScreenshot(name, {
      maxDiffPixelRatio: 0.0,
    });
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
