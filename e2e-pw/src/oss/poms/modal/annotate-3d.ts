import { expect, Locator, Page } from "src/oss/fixtures";
import { ModalPom } from ".";

/**
 * The 3D annotation surface: the `looker3d` viewer in annotate mode plus its
 * floating annotation toolbar, composing with the shared modal POMs. Toolbar
 * buttons expose their action `id` as `data-cy` and active state as
 * `data-cy-active`; the toolbar mounts only once a label is selected or a draw
 * mode is entered, never on bare entry into annotate mode.
 */
export class ModalAnnotate3dPom {
  readonly page: Page;
  readonly modal: ModalPom;
  readonly assert: ModalAnnotate3dAsserter;
  readonly container: Locator;
  readonly canvas: Locator;

  constructor(page: Page, modal: ModalPom) {
    this.page = page;
    this.modal = modal;
    this.assert = new ModalAnnotate3dAsserter(this);
    this.container = page.getByTestId("looker3d");
    this.canvas = this.container.locator("canvas").first();
  }

  /**
   * Wait until the 3D scene is interactable: the looker3d container is mounted
   * and all scene assets have finished loading. Call this before any toolbar /
   * canvas interaction.
   */
  async waitForSurface() {
    await expect(this.container).toBeVisible();
    await this.modal.looker3dControls.waitForAllAssetsLoaded();
  }

  /** Switch the modal into ANNOTATE mode (the explore/annotate toggle). */
  async enterAnnotateMode() {
    await this.page.getByTestId("annotate").click();
  }

  /** Switch the modal back into EXPLORE mode. */
  async enterExploreMode() {
    await this.page.getByTestId("explore").click();
  }

  /**
   * Enter cuboid annotation mode from the sidebar (the 3D Cuboids action). This
   * arms `current3dAnnotationMode`, which mounts the annotation toolbar and
   * auto-resolves the active annotation field — the prerequisite for the
   * Create Cuboid toggle and the draw gesture.
   */
  async enterCuboidMode() {
    await this.page.getByTestId("cuboid-mode").click();
  }

  /**
   * Enter polyline annotation mode from the sidebar (the 3D Polylines action).
   * Arms `current3dAnnotationMode` to polyline, which mounts the annotation
   * toolbar + the polyline-actions group and auto-resolves the active polyline
   * field (FieldSelection filters to polyline fields in this mode) — the
   * prerequisite for New Segment and the canvas draw.
   */
  async enterPolylineMode() {
    await this.page.locator('[data-cy="polyline-mode-3d"]').click();
  }

  /**
   * Toggle the New Segment polyline action. Off→on arms the segmentation state
   * so subsequent empty-canvas clicks place polyline vertices; with a polyline
   * already selected it appends a new segment to it.
   */
  async startSegment() {
    await this.toolbarButton("new-segment").click();
  }

  /**
   * Non-throwing read of whether New Segment is armed. New Segment is a toggle,
   * so a retrying draw must check this before re-arming — clicking it while
   * already active would disarm mid-draw.
   */
  async isNewSegmentActive(): Promise<boolean> {
    const v =
      await this.toolbarButton("new-segment").getAttribute("data-cy-active");
    return v === "true";
  }

  /**
   * A floating annotation-toolbar button by its action id, targeted off `page`
   * because the toolbar renders in the modal portal. Groups mount with context
   * (transform needs a selection, cuboid needs draw mode), so establish that
   * state before clicking.
   */
  toolbarButton(id: ToolbarActionId): Locator {
    return this.page.locator(`[data-cy="${id}"]`);
  }

  /** Toggle cuboid-draw mode (the Create Cuboid toolbar button). */
  async toggleCreateCuboid() {
    await this.toolbarButton("create-cuboid").click();
  }

  /** Select a transform gizmo mode for the currently-selected label. */
  async setTransformMode(mode: "translate" | "rotate" | "scale") {
    await this.toolbarButton(mode).click();
  }

  /** Delete the currently-selected label via the toolbar Delete button. */
  async deleteSelected() {
    await this.toolbarButton("contextual-delete").click();
  }

  /** Deselect / exit the edit form via the toolbar (Esc-equivalent). */
  async deselect() {
    await this.toolbarButton("exit-edit-mode").click();
  }

  /** Toggle the annotation plane helper. */
  async toggleAnnotationPlane() {
    await this.toolbarButton("toggle-annotation-plane").click();
  }

  /**
   * A Position3d geometry input in the edit form, by axis: position
   * `x`/`y`/`z`, dimensions `lx`/`ly`/`lz`, rotation `rx`/`ry`/`rz`. Values are
   * displayed to 2 decimals (e.g. "1.50").
   */
  geometryField(axis: GeometryAxis): Locator {
    return this.page
      .getByTestId("modal")
      .getByTestId("sidebar")
      .getByTestId(`position3d-${axis}`);
  }

  /** Set a Position3d geometry value (commits an undoable engine write). */
  async setGeometry(axis: GeometryAxis, value: string) {
    await this.geometryField(axis).fill(value);
  }

  /** Read a Position3d geometry input's current value. */
  async getGeometry(axis: GeometryAxis): Promise<string> {
    return this.geometryField(axis).inputValue();
  }

  /** Vertex count of the selected 3D polyline, read off the looker3d container. */
  async selectedVertexCount(): Promise<number> {
    return Number(
      await this.container.getAttribute("data-cy-selected-vertex-count"),
    );
  }

  /**
   * The engine-derived sidebar label rows currently listed for the 3D scene.
   * Shared selector with the 2D/video surfaces.
   */
  get labelRows(): Locator {
    return this.page
      .getByTestId("modal")
      .getByTestId("sidebar")
      .locator("[data-cy^='annotate-label-']");
  }

  /** A sidebar label row by its class text (e.g. "car"). */
  labelRow(labelText: string): Locator {
    return this.page
      .getByTestId("modal")
      .getByTestId("sidebar")
      .locator(`[data-cy^='annotate-label-'][data-cy-label='${labelText}']`);
  }

  /** The class text of every listed label row, in DOM order. */
  async listedLabels(): Promise<string[]> {
    return this.labelRows.evaluateAll((els) =>
      els.map((e) => e.getAttribute("data-cy-label") ?? ""),
    );
  }

  /** Select a 3D label by its class text (opens its edit form). */
  async selectLabel(labelText: string) {
    await this.labelRow(labelText).first().click();
  }

  /**
   * The engine instanceId of a listed label (strips the `annotate-label-`
   * prefix from its `data-cy`).
   */
  async labelRowId(labelText: string): Promise<string> {
    const cy = await this.labelRow(labelText).first().getAttribute("data-cy");
    return (cy ?? "").replace(/^annotate-label-/, "");
  }

  /**
   * Draw a cuboid with the three-click gesture (center → orientation → width)
   * at container-fractional coordinates, each click an explicit move→down→up so
   * the empty-canvas handler raycasts a plane point per click. Clicks raycast
   * onto the annotation plane (world XY at z=0), so pair with
   * `looker3dControls.setTopView()` and assert creation rather than geometry.
   */
  async drawCuboid(points: Array<[number, number]>) {
    if (points.length !== 3) {
      throw new Error("a cuboid draw is exactly three clicks");
    }

    const box = await this.canvas.boundingBox();
    if (!box) {
      throw new Error("3D canvas has no bounding box");
    }

    for (const [fx, fy] of points) {
      const x = box.x + box.width * fx;
      const y = box.y + box.height * fy;
      await this.page.mouse.move(x, y);
      await this.page.mouse.down();
      await this.page.mouse.up();
    }
  }

  /**
   * Draw a polyline by clicking each container-fractional vertex (spaced beyond
   * the renderer's 200ms double-click window) and committing with a rapid
   * double-click at the last point, which must stay clear of the first vertex
   * or the loop closes instead. Like {@link drawCuboid}, clicks raycast onto
   * the z=0 annotation plane, so pair with a top view and assert creation
   * rather than exact vertices.
   */
  async drawPolyline(points: Array<[number, number]>) {
    if (points.length < 2) {
      throw new Error("a polyline draw needs at least two clicks");
    }

    const box = await this.canvas.boundingBox();
    if (!box) {
      throw new Error("3D canvas has no bounding box");
    }

    const toScreen = ([fx, fy]: [number, number]): [number, number] => [
      box.x + box.width * fx,
      box.y + box.height * fy,
    ];

    // place each vertex with a single click, spaced beyond the ~200ms
    // double-click window so none reads as a commit
    for (const point of points) {
      const [x, y] = toScreen(point);
      await this.page.mouse.move(x, y);
      await this.page.mouse.down();
      await this.page.mouse.up();
      // the double-click window is itself a timeout; spacing is the semantics
      // eslint-disable-next-line playwright/no-wait-for-timeout
      await this.page.waitForTimeout(250);
    }

    // commit with a rapid double-click at the last vertex
    const [lx, ly] = toScreen(points[points.length - 1]);
    await this.page.mouse.move(lx, ly);
    await this.page.mouse.down();
    await this.page.mouse.up();
    await this.page.mouse.down();
    await this.page.mouse.up();
  }
}

class ModalAnnotate3dAsserter {
  constructor(private readonly pom: ModalAnnotate3dPom) {}

  /**
   * Assert the 3D annotation toolbar is / isn't mounted. Keys off
   * `toggle-annotation-plane`, which is the one action always present in
   * annotate mode (the cuboid/polyline/transform groups mount on demand).
   */
  async toolbarVisible(visible = true) {
    const plane = this.pom.toolbarButton("toggle-annotation-plane");
    return visible
      ? await expect(plane).toBeVisible()
      : await expect(plane).toBeHidden();
  }

  /** Assert cuboid-draw mode is active (Create Cuboid button highlighted). */
  async createCuboidActive(active = true) {
    await expect(this.pom.toolbarButton("create-cuboid")).toHaveAttribute(
      "data-cy-active",
      String(active),
    );
  }

  /** Assert polyline annotation mode is active (the sidebar 3D Polylines button). */
  async polylineModeActive(active = true) {
    await expect(
      this.pom.page.locator('[data-cy="polyline-mode-3d"]'),
    ).toHaveAttribute("data-cy-active", String(active));
  }

  /** Assert the New Segment polyline action is active (segmentation armed). */
  async newSegmentActive(active = true) {
    await expect(this.pom.toolbarButton("new-segment")).toHaveAttribute(
      "data-cy-active",
      String(active),
    );
  }

  /**
   * Assert the transform group is mounted (a label is selected) and a given
   * gizmo mode is active.
   */
  async transformModeActive(mode: "translate" | "rotate" | "scale") {
    await expect(this.pom.toolbarButton(mode)).toHaveAttribute(
      "data-cy-active",
      "true",
    );
  }

  /** Assert a label (by class text) is / isn't listed in the sidebar. */
  async labelListed(labelText: string, listed = true) {
    const row = this.pom.labelRow(labelText);
    return listed
      ? await expect(row).toBeVisible()
      : await expect(row).toHaveCount(0);
  }

  /** Assert the number of label rows currently listed. */
  async labelCount(expected: number) {
    await expect(this.pom.labelRows).toHaveCount(expected);
  }
}

type GeometryAxis = "x" | "y" | "z" | "lx" | "ly" | "lz" | "rx" | "ry" | "rz";

type ToolbarActionId =
  | "create-cuboid"
  | "new-segment"
  | "edit-segments"
  | "snap-close-automatically"
  | "contextual-delete"
  | "toggle-annotation-plane"
  | "translate"
  | "rotate"
  | "scale"
  | "field-selector"
  | "exit-edit-mode";
