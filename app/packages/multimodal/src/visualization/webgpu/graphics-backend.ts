/** Graphics backend selected by Three after renderer initialization. */
export type GraphicsBackend = "webgpu" | "webgl2";

/** Page-scoped backend policy requested through the diagnostic URL override. */
export type GraphicsBackendRequest = "auto" | "webgl2";

/** Supported query parameter for deterministic production-bundle diagnostics. */
export const GRAPHICS_BACKEND_QUERY_PARAMETER = "graphicsBackend";

/** Stable runtime facts published to descendants of one graphics canvas. */
export interface GraphicsRuntime {
  readonly backend: GraphicsBackend;
  readonly surface: string;
}

/** Power preference shared by live and snapshot renderers and diagnostics. */
export const GRAPHICS_POWER_PREFERENCE = "high-performance" as const;

interface ThreeRendererBackend {
  readonly isWebGLBackend?: boolean;
  readonly isWebGPUBackend?: boolean;
}

interface ThreeRendererWithBackend {
  readonly backend?: ThreeRendererBackend;
}

interface ThreeRendererWithAnimationLoop {
  dispose(): void;
  setAnimationLoop?: (callback: unknown) => unknown;
}

/**
 * Reads Three's authoritative post-init backend decision. Keep this access to
 * Three internals in one compatibility seam rather than duplicating casts in
 * every renderer consumer.
 */
export function graphicsBackendForRenderer(renderer: unknown): GraphicsBackend {
  const rendererWithBackend = renderer as ThreeRendererWithBackend;
  if (rendererWithBackend.backend?.isWebGPUBackend === true) {
    return "webgpu";
  }
  if (rendererWithBackend.backend?.isWebGLBackend === true) {
    return "webgl2";
  }
  throw new Error("Three renderer initialized without a recognized backend");
}

/**
 * Disposes a Three renderer while absorbing its ignored async animation-loop
 * shutdown. Three's synchronous dispose method does not return the promise
 * created by setAnimationLoop(null), so a failed init can otherwise surface as
 * an unhandled rejection.
 */
export function disposeGraphicsRenderer(renderer: { dispose(): void }): void {
  const candidate = renderer as ThreeRendererWithAnimationLoop;
  const setAnimationLoop = candidate.setAnimationLoop;
  if (typeof setAnimationLoop !== "function") {
    renderer.dispose();
    return;
  }

  candidate.setAnimationLoop = (callback) => {
    try {
      return Promise.resolve(setAnimationLoop.call(renderer, callback)).catch(
        () => undefined,
      );
    } catch {
      return Promise.resolve();
    }
  };
  try {
    renderer.dispose();
  } finally {
    candidate.setAnimationLoop = setAnimationLoop;
  }
}

/**
 * Reads the non-persistent diagnostic backend request from the page URL.
 * Unknown values deliberately preserve the normal automatic selection path.
 */
export function requestedGraphicsBackend(
  search = typeof window === "undefined" ? "" : window.location.search,
): GraphicsBackendRequest {
  return new URLSearchParams(search).get(GRAPHICS_BACKEND_QUERY_PARAMETER) ===
    "webgl2"
    ? "webgl2"
    : "auto";
}
