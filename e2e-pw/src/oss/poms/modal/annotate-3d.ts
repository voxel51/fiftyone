import { expect, Locator, Page } from "src/oss/fixtures";
import { ModalPom } from ".";

/**
 * The 3D annotation surface: the `looker3d` viewer in ANNOTATE mode plus its
 * floating annotation toolbar (cuboid create, transform gizmo, delete,
 * annotation plane, polyline segments). Composes with the shared modal POMs
 * (`modal.sidebar.annotate` / `modal.sidebar.edit` / `modal.looker3dControls`)
 * — only the 3D-specific toolbar + canvas affordances live here.
 *
 * The annotation toolbar is the shared Voodo `ActionToolbar`, whose buttons
 * expose their action `id` as `data-cy` and active state as `data-cy-active`
 * (e.g. `create-cuboid`, `translate`, `rotate`, `scale`, `contextual-delete`,
 * `toggle-annotation-plane`, `new-segment`). The whole toolbar is gated on an
 * active 3D annotation mode (`MediaTypeFo3d`): it mounts only once a
 * cuboid/polyline is selected (selection arms the mode) or a draw mode is
 * entered — NOT on bare entry into annotate mode. The transform group is only
 * mounted while a cuboid/polyline is selected; the cuboid group only while
 * cuboid-draw mode is active.
 *
 * Sidebar label rows are the engine-presence-derived rows shared with the 2D
 * and video surfaces: `[data-cy^=annotate-label-]` carrying `data-cy-label` /
 * `data-cy-path`.
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
   * A floating annotation-toolbar button by its action id. The toolbar renders
   * in the modal portal, so it's targeted off `page`. Groups mount/unmount with
   * context (transform group needs a selection, cuboid group needs draw mode),
   * so callers must establish that state before clicking.
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
      els.map((e) => e.getAttribute("data-cy-label") ?? "")
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
   * at container-fractional coordinates. Each click is an explicit
   * move→down→up so the looker-3d empty-canvas pointer handler raycasts a plane
   * point per click.
   *
   * Clicks raycast onto the annotation plane (the world XY plane at z=0 by
   * default), so pair this with a top view (`looker3dControls.setTopView()`) to
   * make the gesture land deterministically. The resulting geometry is still
   * camera-dependent, so assert that a cuboid was created + persisted rather
   * than exact location/dimensions.
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
   * Draw a polyline by placing a vertex at each container-fractional point with
   * a single click, then committing with a double-click at the last point.
   *
   * The looker-3d segment renderer detects a commit via a sub-200ms
   * double-click (it drops the duplicate vertex the double-click would add and
   * commits the rest), so each placement click is spaced beyond that window to
   * register as a distinct vertex, and the final commit is a deliberate rapid
   * double-click. Pass at least two points and keep the last point clear of the
   * first (a click within the snap tolerance of the first vertex closes the
   * loop instead of committing).
   *
   * Like {@link drawCuboid}, clicks raycast onto the annotation plane (world XY
   * at z=0), so pair this with a top view; assert that a polyline was created +
   * persisted rather than its exact vertices (camera-dependent world coords).
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
      String(active)
    );
  }

  /** Assert polyline annotation mode is active (the sidebar 3D Polylines button). */
  async polylineModeActive(active = true) {
    await expect(
      this.pom.page.locator('[data-cy="polyline-mode-3d"]')
    ).toHaveAttribute("data-cy-active", String(active));
  }

  /** Assert the New Segment polyline action is active (segmentation armed). */
  async newSegmentActive(active = true) {
    await expect(this.pom.toolbarButton("new-segment")).toHaveAttribute(
      "data-cy-active",
      String(active)
    );
  }

  /**
   * Assert the transform group is mounted (a label is selected) and a given
   * gizmo mode is active.
   */
  async transformModeActive(mode: "translate" | "rotate" | "scale") {
    await expect(this.pom.toolbarButton(mode)).toHaveAttribute(
      "data-cy-active",
      "true"
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
