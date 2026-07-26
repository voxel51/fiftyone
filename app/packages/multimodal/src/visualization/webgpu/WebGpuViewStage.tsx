import {
  createPortal,
  useFrame,
  useThree,
  type RootState,
} from "@react-three/fiber";
import type { CSSProperties, ReactNode } from "react";
import {
  Fragment,
  Suspense,
  createContext,
  lazy,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useId,
  useSyncExternalStore,
  type HTMLAttributes,
} from "react";
import * as THREE from "three";
import { DEFAULT_MAX_RENDERED_POINTS } from "../scene-3d/point-cloud-colors";
import {
  EMPTY_POINT_CLOUD_BUDGET,
  PointCloudCanvasBudget,
} from "../scene-3d/gpu/point-cloud-canvas-budget";

const LazyWebGpuCanvas = lazy(async () => {
  const module = await import("./WebGpuCanvas");
  return { default: module.WebGpuCanvas };
});

const SHARED_VIEW_SURFACE = "modal-images";
const SHARED_VIEW_MIN_RENDER_PRIORITY = 1;
const SHARED_STAGE_FINISH_PRIORITY = Number.MAX_SAFE_INTEGER;

// Image tiles share one demand-rendered device because playback invalidates
// them together. The interactive 3D scene intentionally keeps its own canvas:
// orbit/hover invalidations should not redraw every camera tile.

interface WebGpuViewStageContextValue {
  readonly error: string | null;
  readonly frame: SharedStageFrameCoordinator;
  readonly invalidate: () => void;
  readonly pointCloudBudget: PointCloudCanvasBudget;
  readonly ready: boolean;
  readonly registerView: () => () => void;
  readonly updateView: (id: string, node: ReactNode | null) => void;
}

const WebGpuViewStageContext =
  createContext<WebGpuViewStageContextValue | null>(null);

/** Public readiness and invalidation state for the shared WebGPU stage. */
export interface WebGpuViewStageState {
  readonly error: string | null;
  readonly invalidate: () => void;
  readonly ready: boolean;
}

/** Props for the shared DOM-tracked WebGPU stage. */
export interface WebGpuViewStageProps {
  readonly children: ReactNode;
  readonly className?: string;
  readonly style?: CSSProperties;
}

/**
 * One lazily-mounted WebGPU root for DOM-tracked visualization views.
 * Merely wrapping content is GPU-free; the canvas is created when the
 * first {@link WebGpuView} registers and retired with the last one.
 */
export function WebGpuViewStage({
  children,
  className,
  style,
}: WebGpuViewStageProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const invalidateRef = useRef<(() => void) | null>(null);
  const registrationsRef = useRef(new Set<symbol>());
  const [pointCloudBudget] = useState(
    () => new PointCloudCanvasBudget(DEFAULT_MAX_RENDERED_POINTS),
  );
  const [frame] = useState(() => new SharedStageFrameCoordinator());
  const [dpr, setDpr] = useState(currentStageDpr);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [viewCount, setViewCount] = useState(0);
  const [viewNodes, setViewNodes] = useState<ReadonlyMap<string, ReactNode>>(
    () => new Map(),
  );

  const invalidate = useCallback(() => {
    invalidateRef.current?.();
  }, []);

  const registerView = useCallback(() => {
    const registration = Symbol("webgpu-view");
    registrationsRef.current.add(registration);
    setViewCount(registrationsRef.current.size);
    invalidate();

    let released = false;
    return () => {
      if (released) {
        return;
      }
      released = true;
      registrationsRef.current.delete(registration);
      setViewCount(registrationsRef.current.size);
      invalidate();
    };
  }, [invalidate]);

  const updateView = useCallback((id: string, node: ReactNode | null) => {
    // Stable IDs are load-bearing. Positional portal ownership can attach one
    // camera's stateful texture/scene to another camera's DOM rectangle when
    // sibling tiles update at different times.
    setViewNodes((current) => updateWebGpuViewNodes(current, id, node));
  }, []);

  const handleReady = useCallback(
    (state: { readonly invalidate: () => void }) => {
      invalidateRef.current = state.invalidate;
      setReady(true);
      state.invalidate();
    },
    [],
  );

  const handleError = useCallback((nextError: string | null) => {
    if (!nextError) {
      return;
    }
    // Keep the failure sticky for this provider lifetime. Consumers fall
    // back by unregistering their shared views; clearing at zero views would
    // make them immediately register again and loop through device creation.
    setError((current) => current ?? nextError);
    setReady(false);
  }, []);

  useEffect(() => {
    if (viewCount !== 0) {
      return;
    }
    invalidateRef.current = null;
    setReady(false);
  }, [viewCount]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (viewCount === 0 || !root || typeof ResizeObserver === "undefined") {
      return undefined;
    }

    const observer = new ResizeObserver(invalidate);
    observer.observe(root);
    return () => observer.disconnect();
  }, [invalidate, viewCount]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const updateDpr = () => {
      const nextDpr = currentStageDpr();
      setDpr((current) => (current === nextDpr ? current : nextDpr));
      invalidate();
    };
    const resolution = window.matchMedia?.(
      `(resolution: ${window.devicePixelRatio || 1}dppx)`,
    );
    window.addEventListener("resize", updateDpr);
    window.visualViewport?.addEventListener("resize", updateDpr);
    resolution?.addEventListener?.("change", updateDpr);

    return () => {
      window.removeEventListener("resize", updateDpr);
      window.visualViewport?.removeEventListener("resize", updateDpr);
      resolution?.removeEventListener?.("change", updateDpr);
    };
  }, [dpr, invalidate]);

  const context = useMemo<WebGpuViewStageContextValue>(
    () => ({
      error,
      frame,
      invalidate,
      pointCloudBudget,
      ready,
      registerView,
      updateView,
    }),
    [
      error,
      frame,
      invalidate,
      pointCloudBudget,
      ready,
      registerView,
      updateView,
    ],
  );

  return (
    <WebGpuViewStageContext.Provider value={context}>
      <div
        className={className}
        data-testid="webgpu-view-stage"
        ref={rootRef}
        style={{ ...stageStyle, ...style }}
      >
        {viewCount > 0 && error === null ? (
          <Suspense fallback={null}>
            <LazyWebGpuCanvas
              antialias={false}
              dpr={dpr}
              frameloop="demand"
              onError={handleError}
              onReady={handleReady}
              role="presentation"
              style={canvasStyle}
              surface={SHARED_VIEW_SURFACE}
            >
              <SharedStageFrame frame={frame} />
              {Array.from(viewNodes, ([id, node]) => (
                <Fragment key={id}>{node}</Fragment>
              ))}
            </LazyWebGpuCanvas>
          </Suspense>
        ) : null}
        <div data-testid="webgpu-view-stage-content" style={contentStyle}>
          {children}
        </div>
      </div>
    </WebGpuViewStageContext.Provider>
  );
}

/** Keyed update that preserves scene ownership and insertion order. */
export function updateWebGpuViewNodes(
  current: ReadonlyMap<string, ReactNode>,
  id: string,
  node: ReactNode | null,
): ReadonlyMap<string, ReactNode> {
  if (node === null && !current.has(id)) return current;
  if (node !== null && current.get(id) === node) return current;
  const next = new Map(current);
  if (node === null) next.delete(id);
  else next.set(id, node);
  return next;
}

/** Props for one DOM view rendered through the shared WebGPU stage. */
export interface WebGpuViewProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  "children"
> {
  readonly children?: ReactNode;
  readonly index?: number;
  readonly visible?: boolean;
}

/**
 * A DOM view whose Three scene is rendered by the nearest
 * {@link WebGpuViewStage}. Its bounds drive the renderer's scissor rect.
 */
export function WebGpuView({
  children,
  index,
  style,
  visible,
  ...props
}: WebGpuViewProps) {
  const stage = useContext(WebGpuViewStageContext);
  if (!stage) {
    throw new Error("WebGpuView must be rendered inside WebGpuViewStage");
  }
  const { frame, invalidate, registerView, updateView } = stage;

  const viewId = useId();
  const viewRef = useRef<HTMLDivElement | null>(null);
  const [rect, setRect] = useState<DOMRectReadOnly | null>(null);

  useLayoutEffect(() => registerView(), [registerView]);

  useLayoutEffect(() => {
    const element = viewRef.current;
    if (!(element instanceof HTMLElement)) {
      invalidate();
      return undefined;
    }

    const updateRect = (measured: DOMRectReadOnly) => {
      setRect((current) =>
        current && sameDomRect(current, measured) ? current : measured,
      );
      invalidate();
    };
    const measure = () => updateRect(element.getBoundingClientRect());
    measure();
    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measure);
    const intersectionObserver =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver((entries) => {
            const entry = entries[entries.length - 1];
            if (entry) updateRect(entry.boundingClientRect);
          });
    resizeObserver?.observe(element);
    intersectionObserver?.observe(element);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    window.visualViewport?.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("scroll", measure);
    return () => {
      resizeObserver?.disconnect();
      intersectionObserver?.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
      window.visualViewport?.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("scroll", measure);
      invalidate();
    };
  }, [invalidate]);

  useLayoutEffect(() => {
    invalidate();
  }, [children, invalidate, visible]);

  const portal = useMemo(
    () => (
      <SharedViewPortal
        frame={frame}
        index={index}
        rect={rect}
        visible={visible}
      >
        {children}
      </SharedViewPortal>
    ),
    [children, frame, index, rect, visible],
  );

  useLayoutEffect(() => {
    updateView(viewId, portal);
    return () => updateView(viewId, null);
  }, [portal, updateView, viewId]);

  return (
    <div
      data-webgpu-view=""
      ref={viewRef}
      style={{ ...viewStyle, ...style }}
      {...props}
    />
  );
}

interface SharedViewPortalProps {
  readonly children?: ReactNode;
  readonly frame: SharedStageFrameCoordinator;
  readonly index?: number;
  readonly rect: DOMRectReadOnly | null;
  readonly visible?: boolean;
}

/** Portals one image scene into the shared canvas without Drei's WebGL Y flip. */
function SharedViewPortal({
  children,
  frame,
  index = 1,
  rect,
  visible = true,
}: SharedViewPortalProps) {
  const canvasSize = useThree((state) => state.size);
  const [scene] = useState(() => new THREE.Scene());

  if (!rect) {
    return null;
  }

  return createPortal(
    <SharedViewRenderer
      canvasSize={canvasSize}
      frame={frame}
      index={index}
      rect={rect}
      visible={visible}
    >
      {children}
    </SharedViewRenderer>,
    scene as unknown as Parameters<typeof createPortal>[1],
    {
      size: {
        height: Math.max(1, rect.height),
        left: rect.left,
        top: rect.top,
        width: Math.max(1, rect.width),
      },
    },
  );
}

function SharedViewRenderer({
  canvasSize,
  children,
  frame,
  index,
  rect,
  visible,
}: {
  readonly canvasSize: RootState["size"];
  readonly children?: ReactNode;
  readonly frame: SharedStageFrameCoordinator;
  readonly index: number;
  readonly rect: DOMRectReadOnly;
  readonly visible: boolean;
}) {
  useFrame(
    (state) => {
      if (!visible) {
        return;
      }

      // DOM measurement is the source of truth for a tile. The portal owns an
      // independent scene/camera, while this callback maps it onto one region of
      // the shared physical canvas.
      const bounds = webGpuViewBounds(canvasSize, rect);
      if (!bounds) {
        return;
      }
      if (
        state.size.width !== bounds.width ||
        state.size.height !== bounds.height ||
        state.size.left !== rect.left ||
        state.size.top !== rect.top
      ) {
        // `createPortal()` mirrors the root's `setSize`, whose closure would
        // resize the shared canvas itself. Mutate only this portal store so
        // image-fit subscribers receive the tracked tile dimensions.
        state.set((current) => ({
          size: {
            ...current.size,
            height: bounds.height,
            left: rect.left,
            top: rect.top,
            width: bounds.width,
          },
        }));
        state.invalidate();
      }
      updateViewCamera(state.camera, bounds.width, bounds.height);

      const renderer = state.gl as unknown as SharedStageRenderer;
      // WebGPURenderer currently accepts the DOM-style top-left logical
      // coordinates produced below; DPR scaling remains renderer-owned.
      renderer.setViewport(
        bounds.viewportX,
        bounds.viewportY,
        bounds.scissorWidth,
        bounds.scissorHeight,
      );
      renderer.setScissor(
        bounds.scissorX,
        bounds.scissorY,
        bounds.scissorWidth,
        bounds.scissorHeight,
      );
      renderer.setScissorTest(true);
      try {
        frame.render(renderer, () =>
          renderer.render(state.scene, state.camera),
        );
      } finally {
        renderer.setScissorTest(false);
      }
    },
    Math.min(
      SHARED_STAGE_FINISH_PRIORITY - 1,
      Math.max(SHARED_VIEW_MIN_RENDER_PRIORITY, index),
    ),
  );

  return <>{children}</>;
}

/**
 * Starts and finishes one shared-stage frame. The first renderable view owns
 * the target clear; the finishing callback clears only when every view was
 * hidden or outside the canvas.
 */
function SharedStageFrame({
  frame,
}: {
  readonly frame: SharedStageFrameCoordinator;
}) {
  useFrame(() => frame.begin(), 0);
  useFrame(({ gl }) => {
    frame.finish(gl as unknown as SharedStageRenderer);
  }, SHARED_STAGE_FINISH_PRIORITY);
  return null;
}

interface SharedStageRenderer {
  autoClear: boolean;
  clear(color?: boolean, depth?: boolean, stencil?: boolean): void;
  render(scene: unknown, camera: unknown): void;
  setScissor(x: number, y: number, width: number, height: number): void;
  setScissorTest(enabled: boolean): void;
  setViewport(x: number, y: number, width: number, height: number): void;
}

/**
 * Coordinates clearing across the independently-scissored scenes rendered
 * into one physical WebGPU canvas.
 */
export class SharedStageFrameCoordinator {
  private rendered = false;

  /** Resets render ownership before the view callbacks for a frame run. */
  begin(): void {
    this.rendered = false;
  }

  /** Renders one view, allowing only the first view to clear the target. */
  render(renderer: SharedStageRenderer, render: () => void): void {
    const autoClear = renderer.autoClear;
    const firstView = !this.rendered;
    renderer.autoClear = firstView;
    if (firstView) {
      // The viewport already confines this scene to its tile. Disable scissor
      // for the automatic load-op clear so layout changes cannot leave stale
      // pixels elsewhere on the shared target.
      renderer.setScissorTest(false);
    }
    this.rendered = true;
    try {
      render();
    } finally {
      renderer.autoClear = autoClear;
    }
  }

  /** Clears a frame for which no view produced a valid scissored render. */
  finish(renderer: SharedStageRenderer): void {
    if (this.rendered) return;
    renderer.setScissorTest(false);
    renderer.clear(true, true, true);
  }
}

/** Logical viewport and scissor bounds for one tracked WebGPU view. */
export interface WebGpuViewBounds {
  readonly height: number;
  readonly scissorHeight: number;
  readonly scissorWidth: number;
  readonly scissorX: number;
  readonly scissorY: number;
  readonly viewportX: number;
  readonly viewportY: number;
  readonly width: number;
}

/**
 * Converts a tracked DOM rectangle into WebGPU's top-left-origin logical
 * viewport/scissor coordinates. Returns null for hidden or zero-size views.
 */
export function webGpuViewBounds(
  canvas: RootState["size"],
  rect: Pick<DOMRect, "bottom" | "height" | "left" | "right" | "top" | "width">,
): WebGpuViewBounds | null {
  if (!(rect.width > 0) || !(rect.height > 0)) {
    return null;
  }
  const viewportX = rect.left - canvas.left;
  const viewportY = rect.top - canvas.top;
  const overflowRight = viewportX + rect.width - canvas.width;
  const overflowBottom = viewportY + rect.height - canvas.height;
  // WebGPU rejects negative viewports. Mosaic views normally stay fully
  // contained; skip them during the brief clipped part of a layout animation
  // instead of submitting an invalid viewport or distorting the projection.
  const containmentTolerance = 0.5;
  if (
    viewportX < -containmentTolerance ||
    viewportY < -containmentTolerance ||
    overflowRight > containmentTolerance ||
    overflowBottom > containmentTolerance
  ) {
    return null;
  }
  const safeX = Math.max(0, viewportX);
  const safeY = Math.max(0, viewportY);
  const safeWidth = Math.min(rect.width, canvas.width - safeX);
  const safeHeight = Math.min(rect.height, canvas.height - safeY);
  if (!(safeWidth > 0) || !(safeHeight > 0)) return null;

  return {
    height: rect.height,
    scissorHeight: safeHeight,
    scissorWidth: safeWidth,
    scissorX: safeX,
    scissorY: safeY,
    viewportX: safeX,
    viewportY: safeY,
    width: rect.width,
  };
}

function sameDomRect(left: DOMRectReadOnly, right: DOMRectReadOnly): boolean {
  return (
    left.left === right.left &&
    left.top === right.top &&
    left.width === right.width &&
    left.height === right.height
  );
}

function updateViewCamera(
  camera: unknown,
  width: number,
  height: number,
): void {
  const orthographic = camera as THREE.OrthographicCamera;
  if (orthographic.isOrthographicCamera) {
    if (
      orthographic.left !== width / -2 ||
      orthographic.right !== width / 2 ||
      orthographic.top !== height / 2 ||
      orthographic.bottom !== height / -2
    ) {
      orthographic.left = width / -2;
      orthographic.right = width / 2;
      orthographic.top = height / 2;
      orthographic.bottom = height / -2;
      orthographic.updateProjectionMatrix();
    }
    return;
  }

  const perspective = camera as THREE.PerspectiveCamera;
  const aspect = width / height;
  if (perspective.aspect !== aspect) {
    perspective.aspect = aspect;
    perspective.updateProjectionMatrix();
  }
}

/** Returns the nearest shared-stage state, or null outside a stage. */
export function useWebGpuViewStage(): WebGpuViewStageState | null {
  return useContext(WebGpuViewStageContext);
}

/**
 * Registers point draws owned by one scissored view and returns that view's
 * allocation from the shared physical canvas budget.
 */
export function useWebGpuViewPointCloudBudget(
  demands: readonly { readonly id: string; readonly pointCount: number }[],
  weight = 1,
): ReadonlyMap<string, number> {
  const stage = useContext(WebGpuViewStageContext);
  const size = useThree((state) => state.size);
  const viewId = useId();
  const demandSignature = demands
    .map((demand) => `${demand.id}:${demand.pointCount}`)
    .join("|");

  useLayoutEffect(() => {
    if (!stage) return undefined;
    stage.pointCloudBudget.updateView(viewId, {
      area: size.width * size.height,
      demands,
      weight,
    });
    stage.invalidate();
    return () => {
      stage.pointCloudBudget.removeView(viewId);
      stage.invalidate();
    };
    // demandSignature captures the immutable demand content while allowing
    // callers to rebuild their small descriptor array freely.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demandSignature, size.height, size.width, stage, viewId, weight]);

  const subscribe = useCallback(
    (listener: () => void) =>
      stage?.pointCloudBudget.subscribe(listener) ?? (() => undefined),
    [stage],
  );
  const getSnapshot = useCallback(
    () =>
      stage?.pointCloudBudget.allocation(viewId) ?? EMPTY_POINT_CLOUD_BUDGET,
    [stage, viewId],
  );
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

const stageStyle: CSSProperties = {
  height: "100%",
  minHeight: 0,
  minWidth: 0,
  position: "relative",
  width: "100%",
};

const canvasStyle: CSSProperties = {
  inset: 0,
  pointerEvents: "none",
  position: "absolute",
  zIndex: 0,
};

const contentStyle: CSSProperties = {
  height: "100%",
  minHeight: 0,
  minWidth: 0,
  position: "relative",
  width: "100%",
  zIndex: 1,
};

const viewStyle: CSSProperties = {
  height: "100%",
  width: "100%",
};

/** Native-density image rendering, capped to the performance test envelope. */
function currentStageDpr(): number {
  return typeof window === "undefined"
    ? 1
    : Math.min(2, Math.max(1, window.devicePixelRatio || 1));
}
