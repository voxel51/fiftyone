import { expect, Page } from "src/oss/fixtures";
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
 * The annotation top bar's rendered height (`height: 36px` under border-box
 * sizing, so the 1px bottom border is inside it — see
 * `AnnotationTopBar.module.css`). Measured live where the bar is mounted;
 * this constant covers Explore-mode math where it isn't.
 */
const ANNOTATION_TOP_BAR_HEIGHT = 36;

/**
 * The canvas of the sample plugin in the modal. Applies to image, video and 3D
 * media types.
 *
 * All operations use relative [0, 1] coordinates. On the image Lighter
 * surface they map over the rendered media (see `#coordinateBox`); elsewhere
 * they map over the `sample-canvas` container, not the media within it.
 */
export class SampleCanvasPom {
  readonly assert: SampleCanvasAsserter;
  #box?: Box;
  #mouseX = 0;
  #mouseY = 0;

  constructor(
    readonly page: Page,
    readonly eventUtils: EventUtils,
  ) {
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
    return this.page.evaluate(() => window.__FO_PLAYWRIGHT_CURRENT_CURSOR);
  }

  /**
   * Mouse click on the sample canvas
   *
   * @param x The x coordinate between [0, 1]
   * @param y The y coordinate between [0, 1]
   */
  async click(x: number, y: number) {
    const xy = await this.#toScreenCoordinates(x, y);
    this.#mouseX = xy.x;
    this.#mouseY = xy.y;
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
    this.#mouseX = xy.x;
    this.#mouseY = xy.y;
    await this.page.mouse.dblclick(xy.x, xy.y);
  }

  /**
   * Mouse right-click on the sample canvas.
   *
   * @param x The x coordinate between [0, 1]
   * @param y The y coordinate between [0, 1]
   */
  async rightClick(x: number, y: number) {
    const xy = await this.#toScreenCoordinates(x, y);
    this.#mouseX = xy.x;
    this.#mouseY = xy.y;
    await this.page.mouse.click(xy.x, xy.y, { button: "right" });
  }

  /**
   * Drag the mouse from (x1,y1) to (x2,y2) with interpolated intermediate
   * moves. Used for the brush tool, which paints a dab per `onMove` — a
   * naive two-point move with no intermediates would leave a discontinuous
   * stroke (only endpoints dabbed).
   *
   * @param x1 Start x in [0, 1]
   * @param y1 Start y in [0, 1]
   * @param x2 End x in [0, 1]
   * @param y2 End y in [0, 1]
   * @param steps Number of intermediate moves between start and end
   */
  async drag(x1: number, y1: number, x2: number, y2: number, steps = 10) {
    const start = await this.#toScreenCoordinates(x1, y1);
    const end = await this.#toScreenCoordinates(x2, y2);

    this.#mouseX = start.x;
    this.#mouseY = start.y;
    await this.page.mouse.move(start.x, start.y);
    await this.page.mouse.down();

    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = start.x + (end.x - start.x) * t;
      const y = start.y + (end.y - start.y) * t;
      this.#mouseX = x;
      this.#mouseY = y;
      await this.page.mouse.move(x, y);
    }

    await this.page.mouse.up();
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
   * @param cursor An optional cursor value to expect after moving. When
   *   provided, the move is retried until the cursor matches. This is
   *   necessary because the cursor is event-driven — it only updates when a
   *   mouse event fires — so the underlying state (e.g. detection mode) may
   *   not have settled yet on the first move attempt.
   */
  async move(x: number, y: number, cursor?: string) {
    if (cursor) {
      // The cursor flag only updates on mouse events, so it can hold a stale
      // value from a previous hover (e.g. a just-clicked sidebar button).
      // Reset it so the gate below is only satisfied by a fresh hover-driven
      // update at the target position — otherwise the click can fire before
      // the canvas has rendered the element the test intends to hit.
      await this.page.evaluate(() => {
        window.__FO_PLAYWRIGHT_CURRENT_CURSOR = "";
      });
      await expect(async () => {
        // Recompute per attempt: the coordinate box can change while the
        // surface settles (the media-bounds hook comes online at reveal).
        const xy = await this.#toScreenCoordinates(x, y);
        this.#mouseX = xy.x;
        this.#mouseY = xy.y;
        await this.page.mouse.move(xy.x, xy.y);
        await this.assert.hasCursor(cursor);
      }).toPass();
    } else {
      const xy = await this.#toScreenCoordinates(x, y);
      this.#mouseX = xy.x;
      this.#mouseY = xy.y;
      await this.page.mouse.move(xy.x, xy.y);
    }
  }

  /**
   * Mouse move on the sample canvas by x and y
   *
   * @param x The distance to move along the x-axis
   * @param y The distance to move along the y-axis
   * @param cursor An optional cursor value to expect after moving
   */
  async movePixels(x: number, y: number, cursor?: string) {
    this.#mouseX += x;
    this.#mouseY += y;
    await this.page.mouse.move(this.#mouseX, this.#mouseY);

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
   * Wheel in or out at the current cursor position.
   *
   * Each step applies one wheel event, which Looker translates into a single
   * SCALE_FACTOR (1.09×) multiplication. Positive values zoom in, negative
   * values zoom out.
   *
   * @param steps Number of wheel steps (positive = in, negative = out)
   */
  async wheel(steps: number) {
    const deltaY = steps > 0 ? -1 : 1;
    for (let i = 0; i < Math.abs(steps); i++) {
      await this.page.mouse.wheel(0, deltaY);
    }
  }

  /**
   * Wait for the cursor to change
   */
  async waitForCursorChange() {
    const armed = await this.eventUtils.arm("cursor-change");
    await armed.received;
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
   * The box the [0, 1] coordinate space maps over. The image Lighter surface
   * publishes the canonical media's live screen bounds
   * (`__FO_PLAYWRIGHT_MEDIA_SCREEN_BOUNDS`, mounted by the image renderer
   * only), making fractions image-relative — exact under any viewport fit,
   * pad, or Explore↔Annotate transfer, and immune to chrome around the canvas
   * (the annotation top bar sits above it inside `sample-canvas`). Looker and
   * the video surfaces don't publish the hook, so they keep the
   * `sample-canvas` element box their specs are tuned to.
   */
  async #coordinateBox() {
    const media = await this.page.evaluate(
      () => window.__FO_PLAYWRIGHT_MEDIA_SCREEN_BOUNDS?.() ?? null,
    );

    if (media && media.width > 0 && media.height > 0) {
      return media;
    }

    if (!this.#box) {
      this.#box = await this.locator.boundingBox();
    }

    return this.#box;
  }

  async #toScreenCoordinates(x: number, y: number) {
    const box = await this.#coordinateBox();

    // Whole pixels, like a real pointer: the media-bounds hook derives its
    // box numerically (~1e-8 noise), and a fractional target surfaces that
    // noise in geometry the specs assert exactly (0.5 vs 0.5000000130…).
    return {
      x: Math.round(box.x + x * box.width),
      y: Math.round(box.y + y * box.height),
    };
  }
}

/**
 * Sample canvas asserter
 */
class SampleCanvasAsserter {
  constructor(private readonly sampleCanvasPom: SampleCanvasPom) {}

  /**
   * Does the mouse have this cursor style
   *
   * @param cursor the cursor style
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
    await this.sampleCanvasPom.page.addStyleTag({
      content: ".segmentation-toolbar { display: none !important; }",
    });
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

  /**
   * Cross-mode screenshot: the `sample-canvas` region that shows the same
   * world content in Explore (Looker) and Annotate (Lighter), so one baseline
   * serves both modes. In Annotate the canvas sits below the annotation top
   * bar and the Explore↔Annotate viewport transfer is canvas-local, so
   * Annotate shows exactly Explore's top `height − bar` rows: clip the bar's
   * band from Annotate's top and Explore's bottom.
   *
   * @param name the name of the screenshot
   */
  async hasCrossModeScreenshot(name: string) {
    await expect(this.sampleCanvasPom.checkbox).toBeHidden();
    await this.sampleCanvasPom.tooltip.assert.isVisible(false);
    await this.sampleCanvasPom.moveMouseToViewportEdge();

    const page = this.sampleCanvasPom.page;
    const box = await this.sampleCanvasPom.locator.boundingBox();
    const topBar = page.getByTestId("annotation-top-bar");
    const inAnnotate = (await topBar.count()) > 0;

    if (inAnnotate) {
      const barBox = await topBar.boundingBox();
      expect(barBox.height).toBe(ANNOTATION_TOP_BAR_HEIGHT);
    }

    await expect(page).toHaveScreenshot(name, {
      clip: {
        x: box.x,
        y: inAnnotate ? box.y + ANNOTATION_TOP_BAR_HEIGHT : box.y,
        width: box.width,
        height: box.height - ANNOTATION_TOP_BAR_HEIGHT,
      },
      maxDiffPixelRatio: 0.0,
    });
  }
}

export default SampleCanvasPom;
