import { expect, type Page } from "src/oss/fixtures";
import type { EventUtils, ObservedEvent } from "src/shared/event-utils";
import { type CanvasCapture, SampleCanvasPom } from "../modal/sample-canvas";
import { GridPanelPom } from "./grid-panel";

export type EmbeddingsMode = "explore" | "select";

/** Every frame the plot's chart draws (see EmbeddingsChart.ts) */
const DRAWN = "e2e:embeddings:drawn";
/** The runs list rendering a count of runs (see RunsList.tsx) */
const RUNS_LISTED = "e2e:embeddings:runs-listed";
/** The hover card placed, its image settled (see HoverCard.tsx) */
const HOVER_SHOWN = "e2e:embeddings:hover-shown";

/** A drawn frame's payload; it picks which frame ends a wait */
interface DrawnFrame {
  points: number;
  visible: number;
  /** null when nothing is selected */
  emphasized: number | null;
  /** false under the default label palette */
  colored: boolean;
}

const asFrame = (detail: unknown) => detail as DrawnFrame;

/** Whether `frame` carries every field `match` names */
const drew = (frame: DrawnFrame, match: Partial<DrawnFrame>) =>
  (match.points === undefined || frame.points === match.points) &&
  (match.visible === undefined || frame.visible === match.visible) &&
  (!("emphasized" in match) || frame.emphasized === match.emphasized) &&
  (match.colored === undefined || frame.colored === match.colored);

const listed = (e: ObservedEvent, count: number) =>
  (e.detail as { count: number }).count === count;

/** The plot scene's corner radius, in px (0.5rem in panel.css) */
const PLOT_SCENE_RADIUS = 8;

/**
 * The plot's canvas alone: every element in the plot that holds no canvas
 * (legend, hint, chip, counter, lasso, hover ring) is hidden, while the
 * canvas's containers keep painting the scene's background. The hover card
 * is portaled to the body, so it is hidden by its own id. Hovering never
 * redraws the canvas, so the pointer needs no parking. Inset past the
 * scene's rounded corners and border, which antialias differently run to run
 */
const PLOT_CAPTURE: CanvasCapture = {
  inset: PLOT_SCENE_RADIUS,
  style: [
    "[data-cy=embeddings-plot] *:not(:has(canvas)):not(canvas) { visibility: hidden !important; }",
    "[data-cy=embeddings-hover-card] { visibility: hidden !important; }",
  ].join("\n"),
};

/** Text as a reader sees it: whitespace runs collapse */
const readable = (text: string | null) =>
  text?.replace(/\s+/g, " ").trim() ?? null;

export class EmbeddingsV2Pom {
  readonly assert: EmbeddingsV2Asserter;
  readonly gridPanel: GridPanelPom;
  /** The plot's canvas: every pointer input to it and every capture of it */
  readonly plotCanvas: SampleCanvasPom;

  constructor(
    readonly page: Page,
    private readonly eventUtils: EventUtils,
  ) {
    this.gridPanel = new GridPanelPom(page);
    this.plotCanvas = new SampleCanvasPom(
      page,
      eventUtils,
      this.plot.getByTestId("embeddings-chart-canvas"),
      PLOT_CAPTURE,
    );
    this.assert = new EmbeddingsV2Asserter(this);
  }

  get runsPage() {
    return this.page.getByTestId("embeddings-runs-page");
  }

  get runCount() {
    return this.runsPage.getByTestId("embeddings-runs-count");
  }

  get plot() {
    return this.page.getByTestId("embeddings-plot");
  }

  get counter() {
    return this.plot.getByTestId("embeddings-plot-counter");
  }

  get selectionChip() {
    return this.plot.getByTestId("embeddings-selection-chip");
  }

  get colorByValue() {
    return this.plot.getByTestId("embeddings-color-by-value");
  }

  get legendRamp() {
    return this.plot.getByTestId("embeddings-legend-ramp");
  }

  /** Portaled to the document body, so it is found from the page */
  get hoverCard() {
    return this.page.getByTestId("embeddings-hover-card");
  }

  getRun(brainKey: string) {
    return this.runsPage.getByTestId(`embeddings-run-${brainKey}`);
  }

  getLegendRow(label: string) {
    return this.plot.getByTestId(`embeddings-legend-row-${label}`);
  }

  /** Opens the panel full-screen, replacing the grid, onto its runs list */
  async open() {
    await this.eventUtils.after(RUNS_LISTED, () =>
      this.gridPanel.open("Embeddings"),
    );
  }

  /** Opens the panel beside the grid, so the grid's count stays readable */
  async openInSplit() {
    await this.eventUtils.after(RUNS_LISTED, () =>
      this.gridPanel.openInSplit("Embeddings"),
    );
  }

  /**
   * Opens a run and resolves once the chart has drawn all `points` of it,
   * the moment the plot is hit-testable
   */
  async openRun(brainKey: string, points: number) {
    await this.afterDrawn({ points }, () => this.getRun(brainKey).click());
  }

  /**
   * Resolves once a plot the page restored on its own (a workspace, the
   * session's open run) has drawn a frame matching `frame`
   */
  async untilDrawn(frame: Partial<DrawnFrame>) {
    await this.eventUtils.untilState(
      DRAWN,
      async () =>
        (await this.eventUtils.recorded(DRAWN)).some((d) =>
          drew(asFrame(d), frame),
        ),
      (e) => drew(asFrame(e.detail), frame),
    );
  }

  /**
   * Runs `action` and resolves once the chart draws a frame matching
   * `frame`: say, `{ emphasized: 3 }` for a selection or `{ visible: 25 }`
   * for a filter. Its effect reaches the canvas a frame or more after the
   * action, so screenshot after this
   */
  async afterDrawn<T>(
    frame: Partial<DrawnFrame>,
    action: () => Promise<T>,
  ): Promise<T> {
    return this.eventUtils.after(DRAWN, action, (e) =>
      drew(asFrame(e.detail), frame),
    );
  }

  /** Runs `action` and resolves once the runs list shows `count` runs */
  async afterRunsListed<T>(count: number, action: () => Promise<T>) {
    return this.eventUtils.after(RUNS_LISTED, action, (e) => listed(e, count));
  }

  /** Resolves once a runs list the page restored on its own shows `count` */
  async untilRunsListed(count: number) {
    await this.eventUtils.untilState(
      RUNS_LISTED,
      async () =>
        (await this.eventUtils.recorded(RUNS_LISTED)).some(
          (detail) => detail.count === count,
        ),
      (e) => listed(e, count),
    );
  }

  /** Runs `action` and resolves once the hover card shows with its image */
  async afterHoverShown<T>(action: () => Promise<T>) {
    return this.eventUtils.after(
      HOVER_SHOWN,
      action,
      (e: ObservedEvent) => (e.detail as { image: boolean }).image,
    );
  }

  async setMode(mode: EmbeddingsMode) {
    await this.plot.getByTestId(`embeddings-mode-${mode}`).click();
  }

  /** Esc clears the plot's selection and the grid scope it published */
  async clearSelection() {
    await this.page.keyboard.press("Escape");
  }

  /** The header's reset: clears the legend filter and the selection */
  async clearFiltersAndSelection() {
    await this.plot
      .getByRole("button", { name: "Clear filters and selection" })
      .click();
  }

  /** Back to the runs list, which renders as the plot unmounts */
  async back() {
    await this.eventUtils.after(RUNS_LISTED, () =>
      this.plot.getByRole("button", { name: "Back to visualizations" }).click(),
    );
  }

  /**
   * Runs `action` and resolves once the panel state it changed (the open run,
   * the color-by field) is saved: the save writes the layout, which reloads
   * the page, and the route commit that follows says so
   */
  async afterPanelStateSaved<T>(action: () => Promise<T>): Promise<T> {
    return this.eventUtils.after("e2e:app:page-change", action);
  }

  /** Colors the plot by `field`; resolves once its colors are drawn */
  async colorBy(field: string) {
    await this.plot.getByRole("button", { name: "Color by" }).click();
    await this.afterDrawn({ colored: true }, () =>
      this.plot.getByRole("option", { name: field, exact: true }).click(),
    );
  }

  /** Hides or shows one class. The legend defers a single click briefly, so
   * a double click can cancel it */
  async toggleLegend(label: string) {
    await this.getLegendRow(label).click();
  }

  /** Shows only one class, or restores every class when it is already alone */
  async isolateLegend(label: string) {
    await this.getLegendRow(label).dblclick();
  }

  /**
   * Deletes a run through its card's kebab and inline confirmation; resolves
   * once the refreshed list renders without it
   */
  async deleteRun(brainKey: string) {
    const card = this.getRun(brainKey);
    await card.getByRole("button", { name: "Run actions" }).click();
    await this.page.getByRole("menuitem", { name: "Delete" }).click();
    await this.eventUtils.after(RUNS_LISTED, () =>
      card.getByRole("button", { name: "Delete run" }).click(),
    );
  }
}

class EmbeddingsV2Asserter {
  constructor(private readonly pom: EmbeddingsV2Pom) {}

  /** The loaded runs page; the read waits for it to mount */
  async verifyPanelLoaded() {
    expect(await this.pom.runsPage.getAttribute("class")).toBe("emb-runs-page");
    // No empty-state text assertion: this suite also runs against
    // enterprise builds, and the two app modes deliberately render
    // different no-runs states (upsell landing vs. neutral empty
    // state). The per-mode rendering is unit-tested in RunsList.
    expect(await this.pom.gridPanel.errorBoundary.isVisible()).toBe(false);
  }

  async hasCounter(text: string) {
    expect(readable(await this.pom.counter.textContent())).toBe(text);
  }

  async hasSelectionChip(text: string) {
    expect(readable(await this.pom.selectionChip.textContent())).toBe(text);
  }

  async hasNoSelection() {
    expect(await this.pom.selectionChip.count()).toBe(0);
  }

  async isColoredBy(field: string) {
    expect(await this.pom.colorByValue.textContent()).toBe(field);
  }

  /** A numeric field's legend: a color ramp instead of class rows */
  async hasContinuousLegend() {
    expect(await this.pom.legendRamp.isVisible()).toBe(true);
    const classRows = this.pom.plot.locator(
      '[data-cy^="embeddings-legend-row-"]',
    );
    expect(await classRows.count()).toBe(0);
  }

  /** e.g. "25 / 25": a legend row's count, scoped to a selection */
  async legendRowCounts(label: string, text: string) {
    const count = this.pom.plot.getByTestId(`embeddings-legend-count-${label}`);
    expect(readable(await count.textContent())).toBe(text);
  }

  async legendRowIsOff(label: string, off = true) {
    expect(await this.pom.getLegendRow(label).getAttribute("data-off")).toBe(
      off ? "true" : "false",
    );
  }

  async hasHoverCard(filename: string) {
    const name = this.pom.hoverCard.getByTestId("embeddings-hover-filename");
    expect(await name.textContent()).toBe(filename);
  }

  /** The hover card shows the hovered patch's box, not the whole image */
  async hoverCardIsCropped() {
    const crop = this.pom.hoverCard.getByTestId("embeddings-hover-crop");
    expect(await crop.isVisible()).toBe(true);
  }

  /** The plot's drawing matches its baseline exactly (see PLOT_CAPTURE) */
  async hasScreenshot(name: string) {
    await this.pom.plotCanvas.assert.hasScreenshot(name);
  }

  async hasRunCount(n: number) {
    expect(await this.pom.runCount.textContent()).toBe(
      `${n} visualization${n === 1 ? "" : "s"}`,
    );
  }

  /** The card shows each given text as its own element (badge, status) */
  async runCardShows(brainKey: string, texts: string[]) {
    const card = this.pom.getRun(brainKey);
    for (const text of texts) {
      expect(await card.getByText(text, { exact: true }).count()).toBe(1);
    }
  }

  async hasNoRun(brainKey: string) {
    expect(await this.pom.getRun(brainKey).count()).toBe(0);
  }
}
