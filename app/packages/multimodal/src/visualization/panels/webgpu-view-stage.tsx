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
  type HTMLAttributes,
} from "react";
import * as THREE from "three";

const LazyWebGpuCanvas = lazy(async () => {
  const module = await import("./webgpu-canvas");
  return { default: module.WebGpuCanvas };
});

const SHARED_VIEW_SURFACE = "modal-images";

interface WebGpuViewStageContextValue {
  readonly error: string | null;
  readonly invalidate: () => void;
  readonly ready: boolean;
  readonly registerView: () => () => void;
  readonly updateView: (id: string, node: ReactNode | null) => void;
}

const WebGpuViewStageContext =
  createContext<WebGpuViewStageContextValue | null>(null);

export interface WebGpuViewStageState {
  readonly error: string | null;
  readonly invalidate: () => void;
  readonly ready: boolean;
}

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
  const pendingInvalidationRef = useRef(false);
  const registrationsRef = useRef(new Set<symbol>());
  const [dpr, setDpr] = useState(currentStageDpr);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [viewCount, setViewCount] = useState(0);
  const [viewNodes, setViewNodes] = useState<ReadonlyMap<string, ReactNode>>(
    () => new Map(),
  );

  const invalidate = useCallback(() => {
    const requestRender = invalidateRef.current;
    if (requestRender) {
      requestRender();
    } else {
      pendingInvalidationRef.current = true;
    }
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
    setViewNodes((current) => updateWebGpuViewNodes(current, id, node));
  }, []);

  const handleReady = useCallback(
    (state: { readonly invalidate: () => void }) => {
      invalidateRef.current = state.invalidate;
      setReady(true);
      if (pendingInvalidationRef.current) {
        pendingInvalidationRef.current = false;
      }
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
    pendingInvalidationRef.current = false;
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
    () => ({ error, invalidate, ready, registerView, updateView }),
    [error, invalidate, ready, registerView, updateView],
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
              dpr={dpr}
              frameloop="demand"
              onError={handleError}
              onReady={handleReady}
              role="presentation"
              style={canvasStyle}
              surface={SHARED_VIEW_SURFACE}
            >
              <SharedStageFrame />
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
  const { invalidate, registerView, updateView } = stage;

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
      <SharedViewPortal index={index} rect={rect} visible={visible}>
        {children}
      </SharedViewPortal>
    ),
    [children, index, rect, visible],
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
  readonly index?: number;
  readonly rect: DOMRectReadOnly | null;
  readonly visible?: boolean;
}

/** Portals one image scene into the shared canvas without Drei's WebGL Y flip. */
function SharedViewPortal({
  children,
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
      index={index}
      canvasSize={canvasSize}
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
  index,
  rect,
  visible,
}: {
  readonly canvasSize: RootState["size"];
  readonly children?: ReactNode;
  readonly index: number;
  readonly rect: DOMRectReadOnly;
  readonly visible: boolean;
}) {
  useFrame((state) => {
    if (!visible) {
      return;
    }

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
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
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
      renderer.render(state.scene, state.camera);
    } finally {
      renderer.setScissorTest(false);
      renderer.autoClear = autoClear;
    }
  }, index);

  return <>{children}</>;
}

/** Clears once before the independently-scissored image scenes render. */
function SharedStageFrame() {
  useFrame(({ gl }) => {
    const renderer = gl as unknown as SharedStageRenderer;
    renderer.setScissorTest(false);
    renderer.clear(true, true, true);
  }, 0);
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
