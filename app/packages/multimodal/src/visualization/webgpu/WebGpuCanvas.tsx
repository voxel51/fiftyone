import type { CanvasProps, Dpr, RootState } from "@react-three/fiber";
import { Canvas } from "@react-three/fiber";
import type { CSSProperties, ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three/webgpu";

import { VISUALIZATION_PANEL_BACKGROUND_COLOR } from "../panel-ui/style-tokens";
import {
  registerGraphicsRenderer,
  type GraphicsRendererRegistration,
} from "./graphics-renderer-registry";
import {
  GRAPHICS_POWER_PREFERENCE,
  disposeGraphicsRenderer,
  graphicsBackendForRenderer,
  requestedGraphicsBackend,
  type GraphicsBackend,
  type GraphicsRuntime,
} from "./graphics-backend";
import { GraphicsRuntimeProvider } from "./graphics-runtime-context";
import { errorMessage } from "../../utils/errors";

type GraphicsRootState = RootState & {
  readonly gl: THREE.WebGPURenderer;
};

type RendererWithDreiCompat = THREE.WebGPURenderer & {
  capabilities?: Partial<{
    getMaxAnisotropy: () => number;
    isWebGL2: boolean;
  }>;
};

type RendererWithSetSize = {
  setSize: (width: number, height: number, updateStyle?: boolean) => void;
};

interface WebGpuDeviceLossInfo {
  readonly api?: string;
  readonly message?: string;
  readonly reason?: string | null;
}

type RendererWithDeviceLoss = {
  onDeviceLost?: (info: WebGpuDeviceLossInfo) => void;
};

// Playback canvases redraw frequently; default to CSS pixel density and let
// inspection surfaces opt into higher DPR explicitly when they need it.
const DEFAULT_DPR: Dpr = 1;
const OPAQUE_CLEAR_ALPHA = 1;
const DEFAULT_MAX_ANISOTROPY = 1;
const DEFAULT_SURFACE = "unknown";

const styles: Record<string, CSSProperties> = {
  root: {
    height: "100%",
    // A canvas measured at 0x0 mid-relayout makes the WebGPU backend
    // configure a zero-size swapchain/depth texture, which poisons every
    // command buffer until the next resize. Keep the drawing surface at
    // least 1px so intermediate collapsed layouts can never hit that path.
    minHeight: 1,
    minWidth: 1,
    overflow: "hidden",
    position: "relative",
    width: "100%",
  },
};

/**
 * Props for the shared React Three Fiber graphics canvas root.
 */
export interface WebGpuCanvasProps {
  /**
   * Enables multisample antialiasing for the renderer. Sampled when the
   * renderer is created because Three cannot change its default sample count
   * after the swapchain attachments exist.
   */
  readonly antialias?: boolean;
  readonly camera?: CanvasProps["camera"];
  readonly children: ReactNode;
  readonly className?: string;
  readonly clearColor?: THREE.ColorRepresentation;
  readonly dpr?: Dpr;
  readonly frameloop?: "always" | "demand" | "never";
  readonly orthographic?: boolean;
  readonly role?: string;
  readonly style?: CSSProperties;
  /**
   * Graphics-registry surface tag ("modal-3d", "grid-preview", ...) for the
   * renderer this canvas constructs. Bookkeeping only — it never affects
   * rendering. Sampled when the renderer is created; later prop changes
   * do not retag an already-live renderer.
   */
  readonly surface?: string;
  readonly onError?: (error: string | null) => void;
  readonly onReady?: (state: GraphicsRootState) => void;
}

/**
 * R3F root backed by Three's WebGPU renderer with its WebGL2 fallback.
 */
export function WebGpuCanvas({
  antialias = true,
  camera,
  children,
  className,
  clearColor = VISUALIZATION_PANEL_BACKGROUND_COLOR,
  dpr = DEFAULT_DPR,
  frameloop = "demand",
  onError,
  onReady,
  orthographic,
  role,
  style,
  surface = DEFAULT_SURFACE,
}: WebGpuCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasStateRef = useRef<GraphicsRootState | null>(null);
  const antialiasRef = useRef(antialias);
  const clearColorRef = useRef(clearColor);
  const mountedRef = useRef(true);
  const onErrorRef = useRef(onError);
  const onReadyRef = useRef(onReady);
  // Renderer-lifecycle bookkeeping, keyed by instance so each
  // registration is released exactly once no matter which dispose site
  // (unmount, failed init, superseded init) retires the renderer — or
  // whether more than one fires for the same instance.
  const registrationsRef = useRef(
    new Map<THREE.WebGPURenderer, GraphicsRendererRegistration>(),
  );
  const rendererReadyRef = useRef(false);
  const rendererRef = useRef<THREE.WebGPURenderer | null>(null);
  const readyNotifiedRef = useRef(false);
  // A renderer keeps the surface identity it was mounted with. A prop update
  // while async init is pending must not split its registry, DOM, and runtime
  // identities across different surface labels.
  const surfaceRef = useRef(surface);
  antialiasRef.current = antialias;

  const [runtime, setRuntime] = useState<GraphicsRuntime | null>(null);
  const isReady = runtime !== null;

  const notifyReady = useCallback(() => {
    if (
      readyNotifiedRef.current ||
      !rendererReadyRef.current ||
      !canvasStateRef.current
    ) {
      return;
    }

    readyNotifiedRef.current = true;
    canvasStateRef.current.invalidate();
    onReadyRef.current?.(canvasStateRef.current);
  }, []);

  const createRenderer = useCallback<
    (canvas: HTMLCanvasElement | OffscreenCanvas) => RootState["gl"]
  >((canvas) => {
    const rendererSurface = surfaceRef.current;
    const backendRequest = requestedGraphicsBackend();
    const rendererOptions: ConstructorParameters<
      typeof THREE.WebGPURenderer
    >[0] & { readonly forceWebGL?: boolean } = {
      alpha: false,
      antialias: antialiasRef.current,
      canvas: canvas as HTMLCanvasElement,
      depth: true,
      forceWebGL: backendRequest === "webgl2",
      powerPreference: GRAPHICS_POWER_PREFERENCE,
      stencil: false,
    };
    const renderer = new THREE.WebGPURenderer(rendererOptions);
    const previousRenderer = rendererRef.current;
    if (previousRenderer) {
      disposeRegisteredGraphicsRenderer(
        registrationsRef.current,
        previousRenderer,
      );
    }
    setRuntime(null);
    rendererRef.current = renderer;
    rendererReadyRef.current = false;
    readyNotifiedRef.current = false;
    // Construction reserves a possible WebGPU device. The registration is
    // resolved to the backend Three actually selected only after init.
    registrationsRef.current.set(
      renderer,
      registerGraphicsRenderer(rendererSurface, backendRequest),
    );
    // Hidden or mid-relayout hosts can measure 0x0; a zero-size setSize
    // makes the WebGPU backend configure an empty swapchain/depth texture
    // and every later command buffer fails validation until the next
    // resize. Clamp the drawing surface to at least 1x1. setSize lives on
    // the common Renderer base, which the resolved types don't surface.
    const sizedRenderer = renderer as unknown as RendererWithSetSize;
    const applySize = sizedRenderer.setSize.bind(renderer);
    sizedRenderer.setSize = (width, height, updateStyle) =>
      applySize(Math.max(1, width), Math.max(1, height), updateStyle);
    const rendererWithDeviceLoss =
      renderer as unknown as RendererWithDeviceLoss;
    const defaultDeviceLoss =
      rendererWithDeviceLoss.onDeviceLost?.bind(renderer);
    rendererWithDeviceLoss.onDeviceLost = (info) => {
      defaultDeviceLoss?.(info);
      if (!mountedRef.current || rendererRef.current !== renderer) {
        return;
      }
      // A lost device makes this renderer permanently unusable. Retire its
      // lifecycle accounting and browser resources before dropping the last
      // active identity.
      registrationsRef.current.get(renderer)?.markLost(info);
      disposeRegisteredGraphicsRenderer(registrationsRef.current, renderer);
      rendererRef.current = null;
      rendererReadyRef.current = false;
      setRuntime(null);
      const reason = info.reason ? ` (${info.reason})` : "";
      onErrorRef.current?.(
        `${info.api ?? "WebGPU"} device lost${reason}: ${
          info.message ?? "unknown reason"
        }`,
      );
    };
    // Canvas may ask for a renderer before React rebuilds callbacks. Read the
    // color from a ref so renderer creation stays stable across color changes.
    prepareGraphicsRenderer(renderer, clearColorRef.current);

    renderer
      .init()
      .then(() => {
        if (!mountedRef.current || rendererRef.current !== renderer) {
          disposeRegisteredGraphicsRenderer(registrationsRef.current, renderer);
          return;
        }

        const backend = graphicsBackendForRenderer(renderer);
        registrationsRef.current.get(renderer)?.markReady(backend);
        prepareGraphicsRenderer(renderer, clearColorRef.current, backend);
        rendererReadyRef.current = true;
        setRuntime({ backend, surface: rendererSurface });
        onErrorRef.current?.(null);
      })
      .catch((error: unknown) => {
        const isCurrent =
          mountedRef.current && rendererRef.current === renderer;
        // A rejected init can leave GPU/browser resources behind even if R3F
        // superseded the renderer while the promise was pending.
        registrationsRef.current.get(renderer)?.markFailed(error);
        disposeRegisteredGraphicsRenderer(registrationsRef.current, renderer);
        if (!isCurrent) {
          return;
        }
        rendererRef.current = null;
        rendererReadyRef.current = false;
        setRuntime(null);
        onErrorRef.current?.(errorMessage(error));
      });

    return renderer as unknown as RootState["gl"];
  }, []);

  // This effect keeps the latest error callback available to async renderer setup.
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  // This effect keeps the latest ready callback available after renderer initialization.
  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  // This effect disposes the graphics renderer and clears lifecycle refs on unmount.
  useEffect(() => {
    // React StrictMode replays effects without recreating refs. Restore the
    // mounted state so async renderer initialization from the replayed mount
    // remains eligible to publish its runtime.
    mountedRef.current = true;
    // The map instance is created once per component and never replaced,
    // so capturing it here keeps the cleanup read stable.
    const registrations = registrationsRef.current;
    return () => {
      mountedRef.current = false;
      canvasStateRef.current = null;
      readyNotifiedRef.current = false;
      rendererReadyRef.current = false;
      disposeRegisteredGraphicsRenderer(registrations, rendererRef.current);
      rendererRef.current = null;
    };
  }, []);

  // This effect reapplies renderer color settings when the clear color changes.
  useEffect(() => {
    clearColorRef.current = clearColor;
    if (rendererRef.current) {
      prepareGraphicsRenderer(rendererRef.current, clearColor);
      canvasStateRef.current?.invalidate();
    }
  }, [clearColor]);

  // This effect notifies consumers once Canvas state and renderer initialization are ready.
  useEffect(() => {
    if (isReady) {
      notifyReady();
    }
  }, [isReady, notifyReady]);

  return (
    <Canvas
      camera={camera}
      className={className}
      data-graphics-backend={runtime?.backend}
      data-graphics-surface={surfaceRef.current}
      data-webgpu-surface={surfaceRef.current}
      dpr={dpr}
      flat
      frameloop={isReady ? frameloop : "never"}
      gl={createRenderer as CanvasProps["gl"]}
      onCreated={(state) => {
        canvasStateRef.current = state as GraphicsRootState;
        notifyReady();
      }}
      orthographic={orthographic}
      ref={canvasRef}
      role={role}
      style={{ ...styles.root, ...style }}
    >
      {runtime ? (
        <GraphicsRuntimeProvider runtime={runtime}>
          {children}
        </GraphicsRuntimeProvider>
      ) : null}
    </Canvas>
  );
}

/**
 * Releases and disposes a renderer exactly once. The instance-keyed map entry
 * is the ownership token shared by every overlapping retirement path.
 */
function disposeRegisteredGraphicsRenderer(
  registrations: Map<THREE.WebGPURenderer, GraphicsRendererRegistration>,
  renderer: THREE.WebGPURenderer | null,
): void {
  if (!renderer) {
    return;
  }

  const registration = registrations.get(renderer);
  if (!registration) {
    return;
  }

  registrations.delete(renderer);
  registration.release();
  disposeGraphicsRenderer(renderer);
}

function prepareGraphicsRenderer(
  renderer: THREE.WebGPURenderer,
  clearColor: THREE.ColorRepresentation,
  backend?: GraphicsBackend,
) {
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(clearColor, OPAQUE_CLEAR_ALPHA);

  const rendererWithCompat = renderer as RendererWithDreiCompat;
  rendererWithCompat.capabilities = {
    ...rendererWithCompat.capabilities,
    getMaxAnisotropy:
      rendererWithCompat.capabilities?.getMaxAnisotropy ??
      (() => renderer.getMaxAnisotropy?.() ?? DEFAULT_MAX_ANISOTROPY),
    isWebGL2:
      backend === "webgl2" ||
      (backend === undefined &&
        (rendererWithCompat.capabilities?.isWebGL2 ?? false)),
  };
}
