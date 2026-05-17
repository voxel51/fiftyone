import type { CanvasProps, Dpr, RootState } from "@react-three/fiber";
import { Canvas } from "@react-three/fiber";
import type { CSSProperties, ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three/webgpu";

import { VISUALIZATION_PANEL_BACKGROUND_COLOR } from "./style-tokens";

type WebGpuRootState = RootState & {
  readonly gl: THREE.WebGPURenderer;
};

type RendererWithDreiCompat = THREE.WebGPURenderer & {
  capabilities?: Partial<{
    getMaxAnisotropy: () => number;
    isWebGL2: boolean;
  }>;
};

type WebGpuCanvasGl = (
  canvas: HTMLCanvasElement | OffscreenCanvas
) => RootState["gl"];

const DEFAULT_DPR: Dpr = [1, 2];
const OPAQUE_CLEAR_ALPHA = 1;
const DEFAULT_MAX_ANISOTROPY = 1;

const styles: Record<string, CSSProperties> = {
  root: {
    height: "100%",
    minHeight: 0,
    minWidth: 0,
    overflow: "hidden",
    position: "relative",
    width: "100%",
  },
};

/**
 * Props for the shared React Three Fiber WebGPU canvas root.
 */
export interface WebGpuCanvasProps {
  readonly camera?: CanvasProps["camera"];
  readonly children: ReactNode;
  readonly className?: string;
  readonly clearColor?: THREE.ColorRepresentation;
  readonly dpr?: Dpr;
  readonly frameloop?: "always" | "demand" | "never";
  readonly orthographic?: boolean;
  readonly role?: string;
  readonly style?: CSSProperties;
  readonly onError?: (error: string | null) => void;
  readonly onReady?: (state: WebGpuRootState) => void;
}

/**
 * R3F root backed by Three's WebGPU renderer.
 */
export function WebGpuCanvas({
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
}: WebGpuCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasStateRef = useRef<WebGpuRootState | null>(null);
  const mountedRef = useRef(true);
  const onErrorRef = useRef(onError);
  const onReadyRef = useRef(onReady);
  const rendererReadyRef = useRef(false);
  const rendererRef = useRef<THREE.WebGPURenderer | null>(null);
  const readyNotifiedRef = useRef(false);

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

  const createRenderer = useCallback<WebGpuCanvasGl>(
    (canvas) => {
      const renderer = new THREE.WebGPURenderer({
        alpha: false,
        antialias: true,
        canvas: canvas as HTMLCanvasElement,
        depth: true,
        powerPreference: "high-performance",
        stencil: false,
      });
      rendererRef.current = renderer;
      rendererReadyRef.current = false;
      prepareWebGpuRenderer(renderer, clearColor);

      renderer
        .init()
        .then(() => {
          if (!mountedRef.current || rendererRef.current !== renderer) {
            renderer.dispose();
            return;
          }

          rendererReadyRef.current = true;
          setIsReady(true);
          onErrorRef.current?.(null);
        })
        .catch((error: unknown) => {
          if (mountedRef.current && rendererRef.current === renderer) {
            onErrorRef.current?.(
              error instanceof Error ? error.message : String(error)
            );
          }
        });

      return renderer as unknown as RootState["gl"];
    },
    [clearColor]
  );

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
    return () => {
      mountedRef.current = false;
      canvasStateRef.current = null;
      readyNotifiedRef.current = false;
      rendererReadyRef.current = false;
      rendererRef.current?.dispose();
      rendererRef.current = null;
    };
  }, []);

  // This effect reapplies renderer color settings when the clear color changes.
  useEffect(() => {
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

function prepareWebGpuRenderer(
  renderer: THREE.WebGPURenderer,
  clearColor: THREE.ColorRepresentation
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
