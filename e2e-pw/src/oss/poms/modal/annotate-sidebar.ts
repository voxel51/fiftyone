import { expect, Locator, Page } from "src/oss/fixtures";

/**
 * The modal sidebar's main listing view when in 'Annotate' mode
 */
export class ModalAnnotateSidebarPom {
  readonly page: Page;
  readonly locator: Locator;
  readonly assert: ModalAnnotateSidebarAsserter;
  readonly annotationSliceSelector: Locator;
  readonly annotationSliceResultsContainer: Locator;

  constructor(page: Page) {
    this.page = page;
    this.assert = new ModalAnnotateSidebarAsserter(this);
    this.locator = page.getByTestId("modal").getByTestId("sidebar");
    this.annotationSliceSelector = this.locator.getByTestId(
      "selector-annotation-slice"
    );
    this.annotationSliceResultsContainer = page.getByTestId(
      "selector-results-container-annotation-slice"
    );
  }

  /**
   * Get the count of active labels in the sidebar
   *
   * @returns A promise that resolves to the number of active labels
   */
  async getActiveLabelsCount() {
    return Number(
      await this.locator
        .getByTestId("sidebar-group-Labels-field-count")
        .textContent()
    );
  }

  /**
   * Get the count of active primitive fields in the sidebar
   *
   * @returns A promise that resolves to the number of active primitive fields
   */
  async getActivePrimitiveFieldsCount() {
    return Number(
      await this.locator
        .getByTestId("sidebar-group-PRIMITIVES-field-count")
        .textContent()
    );
  }

  /**
   * Select an active label by name and position
   *
   * @param label The label name to select
   * @param position The position index when multiple labels with the same name exist
   */
  async selectActiveLabel(label: string, position: number) {
    await this.locator
      .getByTestId("sidebar-field")
      .getByText(label)
      .nth(position)
      .click();
  }

  /**
   * Select an active primitive field by field name
   *
   * @param field The primitive field name to select
   */
  async selectActivePrimitiveField(field: string) {
    await this.locator.getByTestId(`${field}-field`).click();
  }

  /**
   * Toggle the active labels section in the sidebar
   */
  async toggleActiveLabels() {
    await this.locator.getByTestId("sidebar-group-Labels-toggle").click();
  }

  /**
   * Toggle the active primitive fields section in the sidebar
   */
  async toggleActivePrimitiveFields() {
    await this.locator.getByTestId("sidebar-group-PRIMITIVES-toggle").click();
  }

  /**
   * Opens the annotation slice selector results menu.
   */
  async openAnnotationSliceResults() {
    await this.annotationSliceSelector.click();
    await expect(this.annotationSliceResultsContainer).toBeVisible();
    return this.annotationSliceResultsContainer;
  }

  /**
   * Returns the slice names currently available in the annotation slice selector.
   */
  async getAvailableAnnotationSlices() {
    const resultsContainer = await this.openAnnotationSliceResults();
    const slices = await resultsContainer.evaluate((div) =>
      Array.from(div.querySelectorAll("[data-cy^='selector-result-']")).map(
        (node) => (node as HTMLElement).innerText
      )
    );

    await this.page.keyboard.press("Escape");

    return slices;
  }

  /**
   * Selects a slice from the annotation slice selector.
   *
   * @param slice The slice name to select
   */
  async selectAnnotationSlice(slice: string) {
    const resultsContainer = await this.openAnnotationSliceResults();
    await resultsContainer.getByTestId(`selector-result-${slice}`).click();
    await expect(this.annotationSliceSelector).toHaveValue(slice);
  }

  /**
   * Resolves on the next successful PATCH to the per-sample dataset
   * endpoint — the backend persist call fired after the user commits an
   * annotation. Returns the promise so callers can `start = waitForPatch()`
   * before the user gesture and `await start` after.
   */
  waitForPatch() {
    return this.page.waitForResponse(
      (resp) =>
        resp.request().method() === "PATCH" &&
        /\/dataset\/[^/]+\/sample\//.test(resp.url()) &&
        resp.status() < 400
    );
  }

  /**
   * Click the Select action button
   */
  async selectAction() {
    await this.page.getByTestId("select-action").click();
  }

  /**
   * Click the Classification action button
   */
  async createClassification() {
    await this.page.getByTestId("create-classification").click();
  }

  /**
   * Activate detection mode for a label type (e.g. "Detections")
   *
   * @param labelType The label type to activate detection mode for
   */
  async detectionMode(labelType: "Detections") {
    if (labelType === "Detections") {
      await this.page.getByTestId("detection-mode").click();
    }
  }

  /** Activate polyline-drawing mode (the Polyline action button). */
  async polylineMode() {
    await this.page.getByTestId("polyline-mode").click();
  }

  /**
   * Toggle segmentation mode. When inactive this enters segmentation mode
   * (selecting the Select tool by default). When active it deactivates the
   * mode.
   */
  async segmentationMode() {
    await this.page.getByTestId("segmentation-mode").click();
  }

  /**
   * The Voodo segmentation toolbar lives in a portal. Buttons are tagged with
   * `aria-label="Select" | "Brush" | "Pen" | "AI" | "Merge"` (and likewise for
   * mode/shape sub-groups).
   */
  private toolbarButton(label: string) {
    return this.page.getByRole("button", { name: label, exact: true });
  }

  /**
   * Switch to a segmentation tool from the floating segmentation toolbar.
   *
   * Requires `segmentationMode()` to have been called first.
   */
  async pickTool(tool: "Select" | "Brush" | "Pen" | "AI" | "Merge") {
    await this.toolbarButton(tool).click();
  }
}

/**
 * Asserter class for the modal's sidebar when in 'Annotate' mode
 */
class ModalAnnotateSidebarAsserter {
  constructor(private readonly modalAnnotateSidebar: ModalAnnotateSidebarPom) {}

  /**
   * Verify that the active labels section is expanded
   */
  async verifyActiveLabelsIsExpanded() {
    await expect(
      this.modalAnnotateSidebar.locator.getByTestId(
        "sidebar-group-Labels-toggle"
      )
    ).toHaveAttribute("data-testid", "RemoveIcon");
  }

  /**
   * Verify that the active labels section is collapsed
   */
  async verifyActiveLabelsIsCollapsed() {
    await expect(
      this.modalAnnotateSidebar.locator.getByTestId(
        "sidebar-group-Labels-toggle"
      )
    ).toHaveAttribute("data-testid", "AddIcon");
  }

  /**
   * Verify that the active primitive fields section is expanded
   */
  async verifyActivePrimitiveFieldsIsExpanded() {
    await expect(
      this.modalAnnotateSidebar.locator.getByTestId(
        "sidebar-group-PRIMITIVES-toggle"
      )
    ).toHaveAttribute("data-testid", "RemoveIcon");
  }

  /**
   * Verify that the active primitive fields section is collapsed
   */
  async verifyActivePrimitiveFieldsIsCollapsed() {
    await expect(
      this.modalAnnotateSidebar.locator.getByTestId(
        "sidebar-group-PRIMITIVES-toggle"
      )
    ).toHaveAttribute("data-testid", "AddIcon");
  }

  /**
   * Verify the count of active labels matches the expected count
   *
   * @param expectedCount The expected number of active labels
   */
  async verifyActiveLabelsCount(expectedCount: number) {
    await expect(
      this.modalAnnotateSidebar.locator.getByTestId(
        "sidebar-group-Labels-field-count"
      )
    ).toHaveText(expectedCount.toString());
  }

  /**
   * Verify the count of active primitive fields matches the expected count
   *
   * @param expectedCount The expected number of active primitive fields
   */
  async verifyActivePrimitiveFieldsCount(expectedCount: number) {
    await expect(
      this.modalAnnotateSidebar.locator.getByTestId(
        "sidebar-group-PRIMITIVES-field-count"
      )
    ).toHaveText(expectedCount.toString());
  }

  /**
   * Verify that the annotation slice selector exposes exactly the expected slices.
   *
   * @param expectedSlices The slice names that should be available
   */
  async verifyAvailableAnnotationSlices(expectedSlices: string[]) {
    const actualSlices =
      await this.modalAnnotateSidebar.getAvailableAnnotationSlices();
    expect(actualSlices).toStrictEqual(expectedSlices);
  }

  /**
   * Verify that the annotation slice selector currently has the expected slice selected.
   *
   * @param expectedSlice The slice name that should be active
   */
  async verifySelectedAnnotationSlice(expectedSlice: string) {
    await expect(this.modalAnnotateSidebar.annotationSliceSelector).toHaveValue(
      expectedSlice
    );
  }

  /**
   * Assert that the Select action is active or inactive
   *
   * @param active Whether the select action should be active (default true)
   */
  async selectIsActive(active = true) {
    const button = this.modalAnnotateSidebar.page.getByTestId("select-action");
    await expect(button).toHaveAttribute("data-cy-active", active.toString());
  }

  /**
   * Assert that the Classification action is active or inactive
   *
   * @param active Whether the classification action should be active (default true)
   */
  async classificationIsActive(active = true) {
    const button = this.modalAnnotateSidebar.page.getByTestId(
      "create-classification"
    );
    await expect(button).toHaveAttribute("data-cy-active", active.toString());
  }

  /**
   * Assert that detection mode is active or inactive
   *
   * @param active Whether detection mode should be active (default true)
   */
  async detectionModeIsActive(active = true) {
    const button = this.modalAnnotateSidebar.page.getByTestId("detection-mode");
    await expect(button).toHaveAttribute("data-cy-active", active.toString());
  }

  /**
   * Assert that segmentation mode is active or inactive
   *
   * @param active Whether segmentation mode should be active (default true)
   */
  async segmentationModeIsActive(active = true) {
    const button = this.modalAnnotateSidebar.page.getByTestId(
      "segmentation-mode"
    );
    await expect(button).toHaveAttribute("data-cy-active", active.toString());
  }

  /**
   * Assert that a given segmentation tool button is currently the active one
   * in the floating toolbar.
   *
   * @param tool The tool that should be active
   */
  async toolIsActive(tool: "Select" | "Brush" | "Pen" | "AI" | "Merge") {
    // Voodo's ToolbarAction reflects the `active` prop as an attribute on the
    // <button>. We don't depend on Voodo's internal class names: aria-pressed
    // is the closest standard signal.
    const button = this.modalAnnotateSidebar.page.getByRole("button", {
      name: tool,
      exact: true,
    });
    await expect(button).toHaveAttribute("aria-pressed", "true");
  }
}
