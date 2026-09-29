import { expect, Locator, Page } from "src/oss/fixtures";
import { expectScreenshot } from "src/oss/utils/screenshot";
import type { EventUtils, ObservedEvent } from "src/shared/event-utils";
import { ToolbarPom } from "./toolbar";
import { TooltipPom } from "./tooltip";

/**
 * A corner of the canvas, clear of anything these tests draw around the
 * center. Used by {@link SampleCanvasPom.clickEmptyArea}.
 */
const EMPTY_AREA = 0.05;

/** Events each hover affordance sends with `{ visible }` as it shows and hides */
const HOVER_AFFORDANCES = [
  "e2e:modal:lighter-toolbar",
  "e2e:modal:sample-checkbox",
  "e2e:modal:tooltip",
] as const;

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
// one wheel gesture of this size zooms Lighter about 1.5x
const ZOOM_IN_WHEEL_DELTA = 125;

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
   * Click a part of the canvas with nothing drawn on it. In segmentation mode
   * with the Select tool this is the deselect gesture.
   */
  async clickEmptyArea() {
    await this.click(EMPTY_AREA, EMPTY_AREA);
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
   * @param cursor An optional cursor the canvas must show after the move
   */
  async move(x: number, y: number, cursor?: string) {
    const xy = await this.#toScreenCoordinates(x, y);
    this.#mouseX = xy.x;
    this.#mouseY = xy.y;

    if (!cursor) {
      await this.page.mouse.move(xy.x, xy.y);
      return;
    }
    // Lighter writes its canvas cursor on each move, and a drawing mode
    // stamps its own when it installs, even after the move
    await this.eventUtils.after(
      "e2e:lighter:cursor",
      () => this.page.mouse.move(xy.x, xy.y),
      (e) => (e.detail as { cursor: string }).cursor === cursor,
    );
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
   * Zoom the Lighter view in about 1.5x at the pointer as one wheel gesture,
   * returning once Lighter has applied it
   */
  async zoomIn() {
    await this.eventUtils.after("lighter:zoomed", () =>
      this.page.mouse.wheel(0, -ZOOM_IN_WHEEL_DELTA),
    );
  }

  /**
   * The Lighter canvas, shared by the image and video surfaces
   */
  get lighterCanvas() {
    return this.page.getByTestId("lighter-sample-renderer-canvas");
  }

  /**
   * Reset Lighter zoom and pan with the Annotate keyboard shortcut
   */
  async resetZoomPan() {
    await this.page.keyboard.press("r");
  }

  /**
   * Park the mouse on the modal backdrop beside its content, where nothing
   * reacts to hover, so tooltips and hover highlights stay out of screenshots
   */
  async parkMouse() {
    const content = await this.page.getByTestId("modal-content").boundingBox();
    await this.page.mouse.move(content.x / 2, content.y + content.height / 2);
    expect(
      await this.page.locator(":hover").last().getAttribute("data-cy"),
    ).toBe("modal");
  }

  /**
   * Park the mouse and resolve once every hover affordance that was showing
   * has hidden; ones already hidden send nothing.
   */
  async prepareForScreenshot() {
    const latest = await this.eventUtils.latest(HOVER_AFFORDANCES);
    const hides = HOVER_AFFORDANCES.filter(
      (event) => latest[event]?.visible === true,
    ).map((events) => ({
      events,
      predicate: (e: ObservedEvent) =>
        (e.detail as { visible?: boolean })?.visible === false,
    }));
    await this.eventUtils.afterAll(hides, () => this.parkMouse());
  }

  /** Hover a label at relative `x`, `y`; resolves once its tooltip shows */
  async hoverLabel(x: number, y: number) {
    await this.tooltip.afterShown(() => this.move(x, y));
  }

  /**
   * Hover the canvas center; resolves once the Lighter toolbar the hover
   * mounts is there
   */
  async revealToolbar() {
    await this.eventUtils.after(
      "e2e:modal:lighter-toolbar",
      () => this.move(0.5, 0.5),
      (e) => (e.detail as { visible?: boolean })?.visible === true,
    );
  }

  /**
   * Run `action` (a mode switch or a quick edit) and resolve once the `type`
   * renderer it switches to has shown its sample
   */
  async afterRenderer<T>(
    type: SampleCanvasType.LIGHTER | SampleCanvasType.LOOKER,
    action: () => Promise<T>,
  ): Promise<T> {
    if (type === SampleCanvasType.LIGHTER) {
      return this.eventUtils.after("e2e:modal:lighter-revealed", action);
    }
    return this.eventUtils.after(
      "e2e:looker:canvas-loaded",
      action,
      (e) => !(e.detail as { thumbnail: boolean }).thumbnail,
    );
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
    await this.#hasScreenshot(this.sampleCanvasPom.locator, name);
  }

  /**
   * Does the media, with the labels Lighter paints over it, match this
   * screenshot; no surrounding controls (timeline, toolbars) are captured
   *
   * @param name the name of the screenshot
   */
  async hasMediaScreenshot(name: string) {
    await this.#hasScreenshot(
      this.sampleCanvasPom.locator.locator("[data-lighter-surface]"),
      name,
    );
  }

  async #hasScreenshot(target: Locator, name: string) {
    await this.sampleCanvasPom.prepareForScreenshot();
    // a Lighter frame paints after the state that caused it, so capture the
    // next one; a looker draws synchronously when its state changes
    if ((await this.sampleCanvasPom.lighterCanvas.count()) > 0) {
      await this.sampleCanvasPom.eventUtils.next("e2e:lighter:frame-painted");
    }
    await expectScreenshot(target, name, {
      style: ".segmentation-toolbar { display: none !important; }",
    });
  }

  /**
   * Does the {@link SampleCanvasType} match
   *
   * @param name The sample canvas type, e.g. "lighter"
   */
  async is(type: SampleCanvasType) {
    expect(
      await this.sampleCanvasPom.locator.getByTestId(type).isVisible(),
    ).toBe(true);
  }
}

export default SampleCanvasPom;
