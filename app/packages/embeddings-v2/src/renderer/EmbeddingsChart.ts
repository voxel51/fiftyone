import {
  BufferAttribute,
  BufferGeometry,
  CustomBlending,
  DynamicDrawUsage,
  Matrix4,
  NormalBlending,
  OneFactor,
  Points,
  RawShaderMaterial,
  Scene,
  Sphere,
  Vector3,
  WebGLRenderer,
} from "three";
import { PlanarCamera } from "./cameras/PlanarCamera";
import {
  buildColumns,
  colorsFromLabels,
  visibleBounds,
  type Columns,
} from "./columns";
import {
  DEFAULT_SETTINGS,
  EMPHASIS_SIZE_PX,
  HOVER_RADIUS_PX,
  PALETTE,
  POINT_SIZE,
} from "./constants";
import { ClickDetector } from "./interaction/ClickDetector";
import { HoverPicker } from "./interaction/HoverPicker";
import { LassoOverlay } from "./interaction/LassoOverlay";
import { nearestPoint, selectInPolygon } from "./math";
import { DensityPipeline } from "./pipeline";
import {
  EMPHASIS_FRAGMENT,
  EMPHASIS_VERTEX,
  POINTS_FRAGMENT,
  POINTS_VERTEX,
} from "./shaders";
import type {
  CameraAdapter,
  CameraAdapterFactory,
  EmbeddingPoint,
  HoverHit,
  InteractionMode,
  Polygon,
  RenderSettings,
} from "./types";

export interface EmbeddingsChartCallbacks {
  /**
   * Point indices selected by the lasso (empty = cleared), plus the
   * lasso polygon in data space when the active camera adapter can
   * provide one — hosts resolve selections server-side from the tiny
   * polygon instead of materializing id lists. External selections
   * applied via setSelected() do NOT echo through this.
   */
  onSelection?: (
    indices: number[],
    dataPolygon?: Array<[number, number]> | null,
  ) => void;
  /** Debounced hover hit, or null the moment hovering breaks */
  onHover?: (hit: HoverHit | null) => void;
  /**
   * A plain click landed on a point. The chart does not change its own
   * selection for point clicks — the host owns click semantics (toggle,
   * replace, open, …). Plain clicks on empty space clear the selection
   * as before.
   */
  onPointClick?: (hit: HoverHit) => void;
  /**
   * A plain click landed on empty space, after the chart cleared its
   * selection and echoed onSelection([]) — for hosts that clear their
   * own layers (filters, chrome) beyond the selection.
   */
  onBackgroundClick?: () => void;
}

export interface EmbeddingsChartOptions {
  /**
   * Camera adapter for data whose points carry a z value. Without it,
   * z is ignored and the data renders flat with the built-in planar
   * camera.
   */
  zCamera?: CameraAdapterFactory;
}

/**
 * The embeddings renderer: one gl.POINTS draw call of typed arrays in
 * data space, custom GLSL for styling and density, and a pluggable
 * camera adapter (built-in planar by default). All vanilla three.js and
 * DOM, no React — any host can drive it directly.
 *
 * Host API: setData / setColors / setVisible / setSelected /
 * setRenderSettings. Selection is one mechanism: the lasso and the host
 * both call setSelected. Non-members recede (dim + desaturate) and the
 * selected points redraw at full opacity in an overlay pass above the
 * composite, where blending cannot swallow them. Visibility is a
 * second, independent mechanism (view-stage subsetting): hidden points
 * don't render and can't be hovered, clicked, or lassoed.
 */
export class EmbeddingsChart {
  private readonly container: HTMLElement;
  private readonly callbacks: EmbeddingsChartCallbacks;
  private readonly zCamera: CameraAdapterFactory | null;
  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly points: Points;
  private readonly material: RawShaderMaterial;
  // Selected points draw a second time, over the composite (own scene:
  // they must not join the density accumulation)
  private readonly overlayScene = new Scene();
  private readonly emphasisPoints: Points;
  private readonly emphasisMaterial: RawShaderMaterial;
  private hasSelection = false;
  private readonly pipeline = new DensityPipeline();
  private readonly lasso: LassoOverlay;
  private readonly picker: HoverPicker;
  private readonly clicks: ClickDetector;
  private readonly resizeObserver: ResizeObserver;
  private readonly listeners = new AbortController();
  private readonly viewProjection = new Matrix4();

  private adapter: CameraAdapter | null = null;
  private adapterHasZ = false;
  private cols: Columns | null = null;
  private colorAttribute: BufferAttribute | null = null;
  private emphasisMask = new Float32Array(0);
  private emphasisAttribute: BufferAttribute | null = null;
  /** Null means all points visible (no unpacked mask to scan) */
  private visibleMask: Uint8Array | null = null;
  private visibleAttribute: BufferAttribute | null = null;
  private settings: RenderSettings = DEFAULT_SETTINGS;
  private interactionMode: InteractionMode = "select";
  private width = 0;
  private height = 0;
  private renderQueued = false;

  constructor(
    container: HTMLElement,
    callbacks: EmbeddingsChartCallbacks = {},
    options: EmbeddingsChartOptions = {},
  ) {
    this.container = container;
    this.callbacks = callbacks;
    this.zCamera = options.zCamera ?? null;

    if (getComputedStyle(container).position === "static") {
      container.style.position = "relative";
    }

    // Sized by CSS; the drawing buffer follows in resize()
    this.canvas = document.createElement("canvas");
    Object.assign(this.canvas.style, {
      position: "absolute",
      inset: "0",
      width: "100%",
      height: "100%",
    });
    container.prepend(this.canvas);

    this.renderer = new WebGLRenderer({
      canvas: this.canvas,
      alpha: true,
      // No MSAA: the fragment shader anti-aliases circle edges
      antialias: false,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(window.devicePixelRatio || 1);
    this.renderer.sortObjects = false;
    this.renderer.setClearColor(0x000000, 0);

    this.material = new RawShaderMaterial({
      vertexShader: POINTS_VERTEX,
      fragmentShader: POINTS_FRAGMENT,
      uniforms: {
        uPointSize: { value: POINT_SIZE * (window.devicePixelRatio || 1) },
        uHasSelection: { value: 0 },
        uMode: { value: 1 },
        uOpacity: { value: DEFAULT_SETTINGS.singleAlpha },
      },
      // Density accumulation: additive ONE/ONE on color and alpha
      // (setRenderSettings swaps blending/depth state per mode)
      transparent: true,
      blending: CustomBlending,
      blendSrc: OneFactor,
      blendDst: OneFactor,
      blendSrcAlpha: OneFactor,
      blendDstAlpha: OneFactor,
      depthTest: false,
      depthWrite: false,
    });
    this.points = new Points(new BufferGeometry(), this.material);
    this.points.frustumCulled = false;
    this.scene.add(this.points);

    this.emphasisMaterial = new RawShaderMaterial({
      vertexShader: EMPHASIS_VERTEX,
      fragmentShader: EMPHASIS_FRAGMENT,
      uniforms: {
        uPointSize: {
          value:
            (POINT_SIZE + EMPHASIS_SIZE_PX) * (window.devicePixelRatio || 1),
        },
      },
      // Plain alpha compositing over the finished frame, no depth
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    // The geometry is shared with the main pass — the emphasis shader
    // clips out everything that isn't selected
    this.emphasisPoints = new Points(
      this.points.geometry,
      this.emphasisMaterial,
    );
    this.emphasisPoints.frustumCulled = false;
    this.overlayScene.add(this.emphasisPoints);

    this.lasso = new LassoOverlay(container, {
      shouldStart: (event) => this.adapter?.isLassoStart(event) ?? false,
      onComplete: (polygon, x, y) => this.handleLasso(polygon, x, y),
    });
    this.picker = new HoverPicker(container, {
      isBlocked: () => this.lasso.isDrawing(),
      pick: (x, y) => this.pick(x, y),
      onHover: (hit) => this.callbacks.onHover?.(hit),
    });
    // Covers plain clicks the lasso doesn't own (camera adapters that use
    // plain drags to move the camera); with the planar camera, plain
    // clicks arrive through the lasso's onComplete(null) instead
    this.clicks = new ClickDetector(container, {
      onClick: (x, y) => this.handleClick(x, y),
    });

    container.addEventListener(
      "dblclick",
      () => {
        this.adapter?.reset();
        this.requestRender();
      },
      { signal: this.listeners.signal },
    );

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
  }

  /**
   * Rebuild GPU buffers for a new dataset. The camera adapter follows
   * the data: points carrying a z use the host's zCamera when provided;
   * otherwise z is ignored and the built-in planar camera renders the
   * data flat. Colors reset to the default label palette and all points
   * become visible until setColors/setVisible.
   */
  setData(points: EmbeddingPoint[]): void {
    // Without a zCamera, flatten z at the column level so the data
    // renders flat instead of clipping against the planar frustum
    const cols = buildColumns(points, this.zCamera === null);
    this.cols = cols;

    const positions = new Float32Array(cols.n * 3);
    for (let i = 0; i < cols.n; i++) {
      positions[i * 3] = cols.xs[i];
      positions[i * 3 + 1] = cols.ys[i];
      positions[i * 3 + 2] = cols.zs[i];
    }
    this.points.geometry.dispose();
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(positions, 3));
    this.colorAttribute = new BufferAttribute(
      colorsFromLabels(cols, PALETTE),
      3,
    );
    geometry.setAttribute("color", this.colorAttribute);
    this.emphasisMask = new Float32Array(cols.n);
    this.emphasisAttribute = new BufferAttribute(this.emphasisMask, 1).setUsage(
      DynamicDrawUsage,
    );
    geometry.setAttribute("emphasis", this.emphasisAttribute);
    this.visibleMask = null;
    this.visibleAttribute = new BufferAttribute(
      new Uint8Array(cols.n).fill(1),
      1,
    ).setUsage(DynamicDrawUsage);
    geometry.setAttribute("visible", this.visibleAttribute);
    // Pre-set so nothing ever calls computeBoundingSphere() at render
    // time (the camera adapters own all framing anyway)
    geometry.boundingSphere = new Sphere(new Vector3(0, 0, 0), 1);
    this.points.geometry = geometry;
    this.emphasisPoints.geometry = geometry;
    this.material.uniforms.uHasSelection.value = 0;
    this.hasSelection = false;

    this.ensureAdapter(cols.hasZ);
    this.adapter?.setBounds(cols, this.width, this.height);
    this.picker.reset();
    this.requestRender();
    this.callbacks.onSelection?.([]);
  }

  /**
   * Per-point colors as flat rgb triplets in [0, 1] — class palettes,
   * scalar colormaps, anything; the shader has no concept of labels.
   * Null restores the default label palette (the uncolored state).
   */
  setColors(colors: Float32Array | null): void {
    const { cols, colorAttribute } = this;
    if (!cols || !colorAttribute) return;
    const next = colors ?? colorsFromLabels(cols, PALETTE);
    if (next.length !== cols.n * 3) {
      throw new Error(
        `setColors expects ${cols.n * 3} floats (n·rgb), got ${next.length}`,
      );
    }
    (colorAttribute.array as Float32Array).set(next);
    colorAttribute.needsUpdate = true;
    this.requestRender();
  }

  /**
   * Per-point visibility as 0/1 bytes (null = all visible) — in FiftyOne
   * terms, the current view's membership mask. Hidden points are clipped
   * in the vertex shader and skipped by every hit-test. The current view
   * never moves when visibility changes, but the camera's FOCUS follows
   * the visible subset: reset() re-frames to it, and orbit-style cameras
   * pivot around it.
   */
  setVisible(mask: Uint8Array | null): void {
    const { cols, visibleAttribute } = this;
    if (!cols || !visibleAttribute) return;
    if (mask && mask.length !== cols.n) {
      throw new Error(
        `setVisible expects ${cols.n} bytes (one per point), got ${mask.length}`,
      );
    }
    const array = visibleAttribute.array as Uint8Array;
    if (mask) {
      array.set(mask);
      this.visibleMask = mask;
    } else {
      array.fill(1);
      this.visibleMask = null;
    }
    if (this.adapter?.setFocus) {
      // An empty visible subset keeps the previous focus — framing
      // nothing helps no one
      const focus = mask ? visibleBounds(cols, mask) : null;
      if (!mask || focus) this.adapter.setFocus(focus);
    }
    visibleAttribute.needsUpdate = true;
    // The point under a still cursor may just have vanished (or appeared)
    this.picker.viewChanged();
    this.requestRender();
  }

  /**
   * Select points by index (null clears). One mechanism for lasso and
   * host alike: members keep their exact color and size, everything
   * else dims. In FiftyOne terms this is a view/filter result, which
   * ships as indices or a bitmask — never as an id list.
   */
  setSelected(indices: ArrayLike<number> | null): void {
    const { cols, emphasisAttribute } = this;
    if (!cols || !emphasisAttribute) return;
    this.emphasisMask.fill(0);
    if (indices) {
      for (let i = 0; i < indices.length; i++) {
        const index = indices[i];
        if (index >= 0 && index < cols.n) this.emphasisMask[index] = 1;
      }
    }
    this.hasSelection = indices !== null;
    this.material.uniforms.uHasSelection.value = this.hasSelection ? 1 : 0;
    emphasisAttribute.needsUpdate = true;
    this.requestRender();
  }

  /** Snap the camera back to its home framing */
  resetCamera(): void {
    this.adapter?.reset();
    this.requestRender();
  }

  /** Hand plain drags to the lasso ("select") or the camera ("explore") */
  setInteractionMode(mode: InteractionMode): void {
    this.interactionMode = mode;
    this.adapter?.setMode?.(mode);
    this.applyCursor();
  }

  /** Compositing mode + tone map parameters, applied live */
  setRenderSettings(settings: RenderSettings): void {
    this.settings = settings;
    const { mode, singleAlpha } = settings;
    const opaque = mode === "opaque";
    this.material.uniforms.uMode.value =
      mode === "density" ? 1 : opaque ? 2 : 0;
    // density accumulates additively (ONE/ONE); alpha and opaque both
    // composite with src-alpha — opaque adds the depth test/write
    this.material.blending =
      mode === "density" ? CustomBlending : NormalBlending;
    this.material.depthTest = opaque;
    this.material.depthWrite = opaque;
    // In opaque mode the same knob doubles as per-point opacity
    this.material.uniforms.uOpacity.value = singleAlpha;
    this.pipeline.applySettings(settings);
    this.requestRender();
  }

  /** Full teardown; forceContextLoss releases the GL context immediately */
  destroy(): void {
    this.picker.destroy();
    this.lasso.destroy();
    this.clicks.destroy();
    this.adapter?.destroy();
    this.listeners.abort();
    this.resizeObserver.disconnect();
    this.points.geometry.dispose();
    this.material.dispose();
    this.emphasisMaterial.dispose();
    this.pipeline.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.canvas.remove();
  }

  /** Swap the camera adapter when the data's shape changes */
  private ensureAdapter(hasZ: boolean): void {
    if (this.adapter && this.adapterHasZ === hasZ) return;
    this.adapter?.destroy();
    const onChange = () => {
      this.requestRender();
      this.picker.viewChanged();
    };
    this.adapter =
      hasZ && this.zCamera
        ? this.zCamera(this.container, onChange)
        : new PlanarCamera(this.container, onChange);
    this.adapter.setMode?.(this.interactionMode);
    this.adapterHasZ = hasZ;
    this.applyCursor();
  }

  /**
   * Crosshair advertises the plain-drag lasso, grab the plain-drag pan;
   * injected adapters without modes keep the default cursor.
   */
  private applyCursor(): void {
    if (!this.adapter?.setMode) {
      this.container.style.cursor = "";
      return;
    }
    this.container.style.cursor =
      this.interactionMode === "select" ? "crosshair" : "grab";
  }

  /** The vertex shader's projection, for CPU-side hit-testing */
  private currentViewProjection(): ArrayLike<number> | null {
    const camera = this.adapter?.camera;
    if (!camera) return null;
    camera.updateMatrixWorld();
    return this.viewProjection.multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse,
    ).elements;
  }

  private pick(x: number, y: number): HoverHit | null {
    const { cols } = this;
    const m = this.currentViewProjection();
    if (!cols || !m) return null;
    return nearestPoint(
      cols,
      m,
      this.width,
      this.height,
      x,
      y,
      HOVER_RADIUS_PX,
      this.visibleMask,
    );
  }

  private handleLasso(polygon: Polygon | null, x: number, y: number): void {
    if (!polygon) {
      // Too short to enclose anything: the gesture was a click
      this.handleClick(x, y);
      return;
    }
    const { cols } = this;
    const m = this.currentViewProjection();
    if (!cols || !m) return;
    const indices = selectInPolygon(
      cols,
      m,
      this.width,
      this.height,
      polygon,
      this.visibleMask,
    );
    this.setSelected(indices.length > 0 ? indices : null);
    this.callbacks.onSelection?.(
      indices,
      this.adapter?.toDataPolygon?.(polygon) ?? null,
    );
  }

  /** Point hit → the host decides; empty space → clear, as ever */
  private handleClick(x: number, y: number): void {
    const hit = this.pick(x, y);
    if (hit && this.callbacks.onPointClick) {
      this.callbacks.onPointClick(hit);
      return;
    }
    this.setSelected(null);
    this.callbacks.onSelection?.([]);
    // A point hit with no onPointClick host falls through to the clear
    // above, but it is not a background click
    if (!hit) this.callbacks.onBackgroundClick?.();
  }

  private resize(): void {
    const width = this.container.clientWidth || 1;
    const height = this.container.clientHeight || 1;
    if (width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    const dpr = window.devicePixelRatio || 1;
    // updateStyle=false: CSS owns the canvas size (see constructor)
    this.renderer.setSize(width, height, false);
    this.pipeline.setSize(Math.round(width * dpr), Math.round(height * dpr));
    this.adapter?.resize(width, height);
    this.requestRender();
  }

  /** Coalesce render requests into one render per animation frame */
  private requestRender(): void {
    if (this.renderQueued) return;
    this.renderQueued = true;
    requestAnimationFrame(() => {
      this.renderQueued = false;
      this.render();
    });
  }

  private render(): void {
    const camera = this.adapter?.camera;
    if (!camera) return;
    this.pipeline.render(
      this.renderer,
      this.scene,
      camera,
      this.settings.mode === "density",
    );
    if (this.hasSelection) {
      // Composite the selection markers over the finished frame
      this.renderer.autoClear = false;
      this.renderer.render(this.overlayScene, camera);
      this.renderer.autoClear = true;
    }
  }
}
