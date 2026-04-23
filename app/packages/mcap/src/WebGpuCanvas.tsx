import {
  createRoot,
  events,
  extend,
  type RenderProps,
} from "@react-three/fiber";
import React from "react";
import * as THREE from "three";
import { WebGPURenderer } from "three/webgpu";

type SizeSnapshot = {
  width: number;
  height: number;
  top: number;
  left: number;
};

type WebGpuCanvasProps = Pick<
  RenderProps<HTMLCanvasElement>,
  "camera" | "frameloop" | "orthographic"
> &
  React.HTMLAttributes<HTMLDivElement> & {
    children?: React.ReactNode;
    fallback?: React.ReactNode;
  };

function hasWebGpuBackend(renderer: WebGPURenderer) {
  return Boolean(
    (
      renderer as WebGPURenderer & {
        backend?: { isWebGPUBackend?: boolean };
      }
    ).backend?.isWebGPUBackend
  );
}

function ensureRendererCompatibility(renderer: WebGPURenderer) {
  const rendererWithCompatibility = renderer as WebGPURenderer & {
    capabilities?: {
      getMaxAnisotropy?: () => number;
      isWebGL2?: boolean;
    };
  };

  if (!rendererWithCompatibility.capabilities) {
    rendererWithCompatibility.capabilities = {};
  }

  if (!rendererWithCompatibility.capabilities.getMaxAnisotropy) {
    rendererWithCompatibility.capabilities.getMaxAnisotropy = () => {
      return renderer.getMaxAnisotropy();
    };
  }

  if (rendererWithCompatibility.capabilities.isWebGL2 === undefined) {
    rendererWithCompatibility.capabilities.isWebGL2 = false;
  }
}

function useElementSize(element: HTMLDivElement | null) {
  const [size, setSize] = React.useState<SizeSnapshot>({
    width: 0,
    height: 0,
    top: 0,
    left: 0,
  });

  React.useLayoutEffect(() => {
    if (!element) {
      return;
    }

    const updateSize = () => {
      const nextRect = element.getBoundingClientRect();
      setSize((currentSize) => {
        if (
          currentSize.width === nextRect.width &&
          currentSize.height === nextRect.height &&
          currentSize.top === nextRect.top &&
          currentSize.left === nextRect.left
        ) {
          return currentSize;
        }

        return {
          width: nextRect.width,
          height: nextRect.height,
          top: nextRect.top,
          left: nextRect.left,
        };
      });
    };

    updateSize();

    if (typeof ResizeObserver === "undefined") {
      return;
    }

    const resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(element);

    return () => {
      resizeObserver.disconnect();
    };
  }, [element]);

  return size;
}

/** Renders MCAP Three.js content through Three's WebGPU renderer. */
export const WebGpuCanvas = React.forwardRef<
  HTMLCanvasElement,
  WebGpuCanvasProps
>(function WebGpuCanvas(
  {
    camera,
    children,
    fallback = null,
    frameloop = "always",
    orthographic = false,
    style,
    ...props
  },
  forwardedRef
) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const [containerElement, setContainerElement] =
    React.useState<HTMLDivElement | null>(null);
  const rootRef = React.useRef<ReturnType<typeof createRoot> | null>(null);
  const rendererRef = React.useRef<WebGPURenderer | null>(null);
  const [isReady, setIsReady] = React.useState(false);
  const [mountError, setMountError] = React.useState<Error | null>(null);
  const size = useElementSize(containerElement);

  React.useImperativeHandle(forwardedRef, () => canvasRef.current as never);

  React.useMemo(() => {
    extend(THREE);
  }, []);

  React.useEffect(() => {
    let cancelled = false;

    const mountRoot = async () => {
      if (!containerElement || !canvasRef.current) {
        return;
      }

      if (size.width <= 0 || size.height <= 0) {
        return;
      }

      if (rootRef.current || rendererRef.current) {
        return;
      }

      const root = createRoot(canvasRef.current);
      const renderer = new WebGPURenderer({
        alpha: true,
        antialias: true,
        canvas: canvasRef.current,
      });

      rootRef.current = root;
      rendererRef.current = renderer;

      await renderer.init();

      if (cancelled || !rootRef.current || !rendererRef.current) {
        return;
      }

      if (!hasWebGpuBackend(renderer)) {
        throw new Error(
          "MCAP WebGpuCanvas requires a WebGPU backend, but Three.js fell back to WebGL."
        );
      }

      ensureRendererCompatibility(renderer);

      root.configure({
        camera,
        events,
        frameloop,
        gl: renderer as never,
        orthographic,
        onCreated: (state) => {
          state.events.connect?.(containerElement);
        },
        size: {
          width: size.width,
          height: size.height,
          top: size.top,
          left: size.left,
          updateStyle: false,
        },
      });
      setIsReady(true);
    };

    mountRoot().catch((error) => {
      if (!cancelled) {
        setMountError(
          error instanceof Error ? error : new Error(String(error))
        );
      }
    });

    return () => {
      cancelled = true;
    };
  }, [
    camera,
    containerElement,
    frameloop,
    orthographic,
    size.height,
    size.left,
    size.top,
    size.width,
  ]);

  React.useEffect(() => {
    if (!isReady || !rootRef.current || !rendererRef.current) {
      return;
    }

    rootRef.current.configure({
      camera,
      frameloop,
      orthographic,
      size: {
        width: size.width,
        height: size.height,
        top: size.top,
        left: size.left,
        updateStyle: false,
      },
    });
  }, [
    camera,
    frameloop,
    isReady,
    orthographic,
    size.height,
    size.left,
    size.top,
    size.width,
  ]);

  React.useEffect(() => {
    if (!isReady || !rootRef.current) {
      return;
    }

    rootRef.current.render(
      <React.Suspense fallback={fallback}>{children ?? null}</React.Suspense>
    );
  }, [children, fallback, isReady]);

  React.useEffect(() => {
    return () => {
      rootRef.current?.unmount();
      rootRef.current = null;
      rendererRef.current?.dispose();
      rendererRef.current = null;
    };
  }, []);

  if (mountError) {
    throw mountError;
  }

  return (
    <div
      ref={setContainerElement}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        ...style,
      }}
      {...props}
    >
      <canvas
        ref={canvasRef}
        style={{
          display: "block",
          width: "100%",
          height: "100%",
        }}
      >
        {fallback}
      </canvas>
    </div>
  );
});
