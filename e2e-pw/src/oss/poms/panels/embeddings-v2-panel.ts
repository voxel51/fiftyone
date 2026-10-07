import path from "node:path";
import { Locator, Page, expect } from "src/oss/fixtures";
import type { EventUtils } from "src/shared/event-utils";
import { GridPanelPom } from "./grid-panel";

/** A rectangle in [0, 1] coordinates relative to the plot canvas */
export interface RelativeRect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export type EmbeddingsMode = "explore" | "select";

/** The chart's drawn event names its point count; match one frame by it */
const drewPoints =
  (n: number) =>
  (e: { detail?: unknown }): boolean =>
    typeof e.detail === "object" &&
    e.detail !== null &&
    "points" in e.detail &&
    e.detail.points === n;

/** ...and how many points it emphasizes, null when nothing is selected */
const drewEmphasis =
  (n: number | null) =>
  (e: { detail?: unknown }): boolean =>
    typeof e.detail === "object" &&
    e.detail !== null &&
    "emphasized" in e.detail &&
    e.detail.emphasized === n;

/** Hides the DOM over the plot's canvas for a screenshot */
const CANVAS_ONLY = path.resolve(__dirname, "embeddings-canvas-only.css");

export class EmbeddingsV2Pom {
  readonly assert: EmbeddingsV2Asserter;
  readonly runsPage: Locator;
  readonly plot: Locator;
  readonly canvas: Locator;
  readonly counter: Locator;
  readonly selectionChip: Locator;
  /** Portaled to the document body, so it is found from the page */
  readonly hoverCard: Locator;
  readonly gridPanel: GridPanelPom;

  constructor(
    readonly page: Page,
    readonly eventUtils: EventUtils,
  ) {
    this.gridPanel = new GridPanelPom(page);
    this.runsPage = page.getByTestId("embeddings-runs-page");
    this.plot = page.getByTestId("embeddings-plot");
    this.canvas = this.plot.getByTestId("embeddings-chart-canvas");
    this.counter = this.plot.getByTestId("embeddings-plot-counter");
    this.selectionChip = this.plot.getByTestId("embeddings-selection-chip");
    this.hoverCard = page.getByTestId("embeddings-hover-card");
    this.assert = new EmbeddingsV2Asserter(this);
  }

  /** Opens the panel full-screen, replacing the grid */
  async open() {
    await this.gridPanel.open("Embeddings");
  }

  /** Opens the panel beside the grid, so the grid's count stays readable */
  async openInSplit() {
    await this.gridPanel.openInSplit("Embeddings");
  }

  run(brainKey: string) {
    return this.runsPage.getByTestId(`embeddings-run-${brainKey}`);
  }

  /**
   * Opens a run from the runs list and waits until the chart has DRAWN all
   * `points` of it — the moment the plot is hit-testable
   */
  async openRun(brainKey: string, points: number) {
    await this.eventUtils.after(
      "embeddings-chart-drawn",
      () => this.run(brainKey).click(),
      drewPoints(points),
    );
  }

  /**
   * Runs `action` and resolves once the chart draws a frame emphasizing
   * `points` points (null: no selection). Screenshot after this, not after
   * the action alone: a selection reaches the canvas a frame or more later,
   * and the frame before it is just as stable.
   */
  async afterEmphasisDrawn<T>(
    points: number | null,
    action: () => Promise<T>,
  ): Promise<T> {
    return this.eventUtils.after(
      "embeddings-chart-drawn",
      action,
      drewEmphasis(points),
    );
  }

  /**
   * {@link afterEmphasisDrawn} for a wait that spans assertions: arm before
   * the action, assert, then await `received` before the screenshot
   */
  async armEmphasisDrawn(points: number | null) {
    return this.eventUtils.arm("embeddings-chart-drawn", drewEmphasis(points));
  }

  async setMode(mode: EmbeddingsMode) {
    const segment = this.plot.getByTestId(`embeddings-mode-${mode}`);
    await segment.click();
    await expect(segment).toHaveAttribute("data-active", "true");
  }

  /**
   * Drags a closed lasso around a rectangle of the canvas, corner to corner.
   * A straight drag encloses no area, so it would select nothing.
   */
  async lasso({ x1, y1, x2, y2 }: RelativeRect) {
    const at = await this.toScreen();
    const [start, ...rest] = [
      at(x1, y1),
      at(x2, y1),
      at(x2, y2),
      at(x1, y2),
      at(x1, y1),
    ];

    await this.page.mouse.move(start.x, start.y);
    await this.page.mouse.down();
    for (const corner of rest) {
      await this.page.mouse.move(corner.x, corner.y, { steps: 5 });
    }
    await this.page.mouse.up();
  }

  /** Esc clears the plot's selection and the grid scope it published */
  async clearSelection() {
    await this.page.keyboard.press("Escape");
  }

  /** A plain click on the canvas, in [0, 1] coordinates */
  async clickCanvas(x: number, y: number) {
    const at = (await this.toScreen())(x, y);
    await this.page.mouse.click(at.x, at.y);
  }

  /**
   * Moves the pointer onto a spot of the canvas from a little to its left,
   * so the hover picker sees the pointer arrive rather than appear
   */
  async hover(x: number, y: number) {
    const at = (await this.toScreen())(x, y);
    await this.page.mouse.move(at.x - 40, at.y);
    await this.page.mouse.move(at.x, at.y, { steps: 5 });
  }

  /** Maps [0, 1] canvas coordinates to page coordinates */
  private async toScreen() {
    const box = await this.canvas.boundingBox();
    if (!box) {
      throw new Error("the embeddings canvas is not visible");
    }
    return (x: number, y: number) => ({
      x: box.x + x * box.width,
      y: box.y + y * box.height,
    });
  }

  /** The header's reset: clears the legend filter and the selection */
  async clearFiltersAndSelection() {
    await this.plot
      .getByRole("button", { name: "Clear filters and selection" })
      .click();
  }

  async back() {
    await this.plot
      .getByRole("button", { name: "Back to visualizations" })
      .click();
  }

  async colorBy(field: string) {
    await this.plot.getByRole("button", { name: "Color by" }).click();
    await this.plot.getByRole("option", { name: field, exact: true }).click();
  }

  legendRow(label: string) {
    return this.plot.getByTestId(`embeddings-legend-row-${label}`);
  }

  /** Hides or shows one class. The legend defers a single click briefly, so
   * a double click can cancel it */
  async toggleLegend(label: string) {
    await this.legendRow(label).click();
  }

  /** Shows only one class, or restores every class when it is already alone */
  async isolateLegend(label: string) {
    await this.legendRow(label).dblclick();
  }

  /** Deletes a run through its card's kebab and inline confirmation */
  async deleteRun(brainKey: string) {
    const card = this.run(brainKey);
    await card.getByRole("button", { name: "Run actions" }).click();
    await this.page.getByRole("menuitem", { name: "Delete" }).click();
    await card.getByRole("button", { name: "Delete run" }).click();
  }
}

class EmbeddingsV2Asserter {
  constructor(private readonly pom: EmbeddingsV2Pom) {}

  async verifyPanelLoaded() {
    await expect(this.pom.runsPage).toBeVisible();
    // No empty-state text assertion: this suite also runs against
    // enterprise builds, and the two app modes deliberately render
    // different no-runs states (upsell landing vs. neutral empty
    // state). The per-mode rendering is unit-tested in RunsList.
    await expect(this.pom.gridPanel.errorBoundary).toBeHidden();
  }

  async hasCounter(text: string) {
    await expect(this.pom.counter).toHaveText(text);
  }

  async hasSelectionChip(text: string) {
    await expect(this.pom.selectionChip).toHaveText(text);
  }

  async hasNoSelection() {
    await expect(this.pom.selectionChip).toBeHidden();
  }

  /** The chart has drawn a frame of exactly `points` points */
  async hasDrawn(points: number) {
    await expect(this.pom.canvas).toHaveAttribute(
      "data-drawn-points",
      String(points),
    );
  }

  async isColoredBy(field: string) {
    await expect(
      this.pom.plot.getByRole("button", { name: "Color by" }),
    ).toContainText(field);
  }

  /** A numeric field's legend: a color ramp instead of class rows */
  async hasContinuousLegend() {
    await expect(
      this.pom.plot.getByTestId("embeddings-legend-ramp"),
    ).toBeVisible();
  }

  /** e.g. "25 / 25" — a legend row's count, scoped to a selection */
  async legendRowCounts(label: string, text: string) {
    await expect(this.pom.legendRow(label)).toContainText(text);
  }

  async hasHoverCard(title: string) {
    await expect(this.pom.hoverCard).toBeVisible();
    await expect(this.pom.hoverCard).toContainText(title);
  }

  /** The hover card shows the hovered patch's box, not the whole image */
  async hoverCardIsCropped() {
    await expect(
      this.pom.hoverCard.getByTestId("embeddings-hover-crop"),
    ).toBeVisible();
  }

  /**
   * The canvas matches its baseline exactly. Only the drawing is captured
   * (see CANVAS_ONLY), so a baseline changes only when the drawing does.
   */
  async hasScreenshot(name: string) {
    await expect(this.pom.canvas).toHaveScreenshot(name, {
      maxDiffPixelRatio: 0,
      threshold: 0,
      stylePath: CANVAS_ONLY,
    });
  }

  async legendRowIsOff(label: string, off = true) {
    await expect(this.pom.legendRow(label)).toHaveAttribute(
      "data-off",
      off ? "true" : "false",
    );
  }

  async hasRunCount(n: number) {
    await expect(this.pom.runsPage).toContainText(
      `${n} visualization${n === 1 ? "" : "s"}`,
    );
  }

  /** The card shows every given piece of text (badge, status, meta) */
  async runCardShows(brainKey: string, texts: string[]) {
    const card = this.pom.run(brainKey);
    for (const text of texts) {
      await expect(card).toContainText(text);
    }
  }

  async hasNoRun(brainKey: string) {
    await expect(this.pom.run(brainKey)).toBeHidden();
  }
}
