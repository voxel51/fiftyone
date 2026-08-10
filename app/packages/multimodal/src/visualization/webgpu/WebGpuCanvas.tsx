import type { CanvasProps, Dpr, RootState } from "@react-three/fiber";
import { Canvas } from "@react-three/fiber";
import type { CSSProperties, ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three/webgpu";

import { VISUALIZATION_PANEL_BACKGROUND_COLOR } from "../panel-ui/style-tokens";
import {
  registerWebGpuRenderer,
  type WebGpuRendererRegistration,
} from "./webgpu-device-registry";
import {
  isVisualizationCostObserved,
  recordVisualizationCost,
  visualizationCostNowMs,
} from "../../observability/visualization-cost";
import { errorMessage } from "../../utils/errors";

type WebGpuRootState = RootState & {
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
 * Props for the shared React Three Fiber WebGPU canvas root.
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
   * Device-registry surface tag ("modal-3d", "grid-preview", ...) for the
   * renderer this canvas constructs. Bookkeeping only — it never affects
   * rendering. Sampled when the renderer is created; later prop changes
   * do not retag an already-live renderer.
   */
  readonly surface?: string;
  readonly onError?: (error: string | null) => void;
  readonly onReady?: (state: WebGpuRootState) => void;
}

/**
 * R3F root backed by Three's WebGPU renderer.
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
  const canvasStateRef = useRef<WebGpuRootState | null>(null);
  const antialiasRef = useRef(antialias);
  const clearColorRef = useRef(clearColor);
  const mountedRef = useRef(true);
  const onErrorRef = useRef(onError);
  const onReadyRef = useRef(onReady);
  // Device-registry bookkeeping, keyed by renderer instance so each
  // registration is released exactly once no matter which dispose site
  // (unmount, failed init, superseded init) retires the renderer — or
  // whether more than one fires for the same instance.
  const registrationsRef = useRef(
    new Map<THREE.WebGPURenderer, WebGpuRendererRegistration>(),
  );
  const rendererReadyRef = useRef(false);
  const rendererRef = useRef<THREE.WebGPURenderer | null>(null);
  const readyNotifiedRef = useRef(false);
  const surfaceRef = useRef(surface);
  antialiasRef.current = antialias;
  surfaceRef.current = surface;

  const [isReady, setIsReady] = useState(false);

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
    const renderer = new THREE.WebGPURenderer({
      alpha: false,
      antialias: antialiasRef.current,
      canvas: canvas as HTMLCanvasElement,
      depth: true,
      powerPreference: "high-performance",
      stencil: false,
    });
    rendererRef.current = renderer;
    rendererReadyRef.current = false;
    // Bookkeeping only: record the renderer (one GPUDevice) in the device
    // registry. Every dispose site below releases this registration via
    // the instance-keyed map, so counts stay balanced.
    registrationsRef.current.set(
      renderer,
      registerWebGpuRenderer(surfaceRef.current),
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
      // A lost device makes this renderer permanently unusable. Clear the
      // identity before surfacing the error so later effects cannot prepare or
      // invalidate it as though it were still the active backend.
      rendererRef.current = null;
      rendererReadyRef.current = false;
      releaseRendererRegistration(registrationsRef.current, renderer);
      setIsReady(false);
      const reason = info.reason ? ` (${info.reason})` : "";
      onErrorRef.current?.(
        `${info.api ?? "WebGPU"} device lost${reason}: ${
          info.message ?? "unknown reason"
        }`,
      );
    };
    // Canvas may ask for a renderer before React rebuilds callbacks. Read the
    // color from a ref so renderer creation stays stable across color changes.
    prepareWebGpuRenderer(renderer, clearColorRef.current);

    renderer
      .init()
      .then(() => {
        if (!mountedRef.current || rendererRef.current !== renderer) {
          releaseRendererRegistration(registrationsRef.current, renderer);
          renderer.dispose();
          return;
        }

        rendererReadyRef.current = true;
        setIsReady(true);
        onErrorRef.current?.(null);
      })
      .catch((error: unknown) => {
        if (mountedRef.current && rendererRef.current === renderer) {
          // A failed WebGPU init can leave GPU/browser resources attached to
          // the renderer object. Dispose only the current renderer instance.
          releaseRendererRegistration(registrationsRef.current, renderer);
          renderer.dispose();
          rendererRef.current = null;
          rendererReadyRef.current = false;
          setIsReady(false);
          onErrorRef.current?.(errorMessage(error));
        }
      });

    return renderer as unknown as RootState["gl"];
  }, []);

  // This effect keeps the latest error callback available to async renderer setup.
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  // This effect keeps the latest ready callback available after WebGPU initialization.
  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  // This effect disposes the WebGPU renderer and clears lifecycle refs on unmount.
  useEffect(() => {
    // The map instance is created once per component and never replaced,
    // so capturing it here keeps the cleanup read stable.
    const registrations = registrationsRef.current;
    return () => {
      mountedRef.current = false;
      canvasStateRef.current = null;
      readyNotifiedRef.current = false;
      rendererReadyRef.current = false;
      releaseRendererRegistration(registrations, rendererRef.current);
      rendererRef.current?.dispose();
      rendererRef.current = null;
    };
  }, []);

  // This effect reapplies renderer color settings when the clear color changes.
  useEffect(() => {
    clearColorRef.current = clearColor;
    if (rendererRef.current) {
      prepareWebGpuRenderer(rendererRef.current, clearColor);
      canvasStateRef.current?.invalidate();
    }
  }, [clearColor]);

  // This effect notifies consumers once Canvas state and WebGPU initialization are ready.
  useEffect(() => {
    if (isReady) {
      notifyReady();
    }
  }, [isReady, notifyReady]);

  return (
    <Canvas
      camera={camera}
      className={className}
      data-webgpu-surface={surface}
      dpr={dpr}
      flat
      frameloop={isReady ? frameloop : "never"}
      gl={createRenderer as CanvasProps["gl"]}
      onCreated={(state) => {
        canvasStateRef.current = state as WebGpuRootState;
        notifyReady();
      }}
      orthographic={orthographic}
      ref={canvasRef}
      role={role}
      style={{ ...styles.root, ...style }}
    >
      {isReady ? children : null}
    </Canvas>
  );
}

/**
 * Releases a renderer's device-registry registration exactly once: the
 * instance-keyed map entry is deleted on the first call, so overlapping
 * dispose sites (e.g. unmount racing a pending init) cannot double-release.
 */
function releaseRendererRegistration(
  registrations: Map<THREE.WebGPURenderer, WebGpuRendererRegistration>,
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
}

function prepareWebGpuRenderer(
  renderer: THREE.WebGPURenderer,
  clearColor: THREE.ColorRepresentation,
) {
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(clearColor, OPAQUE_CLEAR_ALPHA);

  const rendererWithCompat = renderer as RendererWithDreiCompat;
  rendererWithCompat.capabilities = {
    ...rendererWithCompat.capabilities,
    getMaxAnisotropy:
      rendererWithCompat.capabilities?.getMaxAnisotropy ??
      (() => renderer.getMaxAnisotropy?.() ?? DEFAULT_MAX_ANISOTROPY),
    isWebGL2: rendererWithCompat.capabilities?.isWebGL2 ?? false,
  };
}
