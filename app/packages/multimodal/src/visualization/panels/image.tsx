import { Icon, IconName, Size } from "@voxel51/voodo";
import type { CSSProperties, MutableRefObject } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { EncodedImageVisualization } from "../../decoders";
import {
  Base2DScene,
  ImageTexturePlane,
  type ImageTextureHandle,
  type ImageViewTransform,
} from "./base-2d-scene";
import { createImageTexture } from "./image-texture";
import {
  VISUALIZATION_HUD_BACKGROUND_COLOR,
  VISUALIZATION_HUD_BORDER_COLOR,
  VISUALIZATION_HUD_TEXT_COLOR,
  VISUALIZATION_PANEL_BACKGROUND_COLOR,
  VISUALIZATION_STATUS_TEXT_COLOR,
} from "./style-tokens";
import { WebGpuCanvas } from "./webgpu-canvas";

type ImageLoadStatus = "loading" | "loaded" | "error";

const HUD_BORDER_RADIUS_PX = 4;
const HUD_OFFSET_PX = 8;
const STATUS_FONT_SIZE_PX = 13;
const STATUS_PADDING_PX = 16;

const ORTHOGRAPHIC_IMAGE_CAMERA = {
  far: 10,
  near: -10,
  position: [0, 0, 1] as [number, number, number],
  zoom: 1,
};

/**
 * Props for rendering one decoded encoded-image visualization frame.
 */
export interface ImagePanelProps {
  readonly alt?: string;
  readonly className?: string;
  readonly fit?: "contain" | "cover";
  readonly frame: EncodedImageVisualization;
  readonly onImageLoaded?: (width: number, height: number) => void;
  readonly onResetView?: () => void;
  readonly style?: CSSProperties;
  readonly viewTransform?: ImageViewTransform;
}

/**
 * Production image visualization panel backed by a stable Three.js canvas.
 */
export function ImagePanel({
  alt: _alt = "Image",
  className,
  fit = "contain",
  frame,
  onImageLoaded,
  onResetView,
  style,
  viewTransform,
}: ImagePanelProps) {
  const textureHandleRef = useRef<ImageTextureHandle | null>(null);
  const hasVisibleImageRef = useRef(false);
  const onImageLoadedRef = useRef(onImageLoaded);
  onImageLoadedRef.current = onImageLoaded;
  const [canvasError, setCanvasError] = useState<string | null>(null);
  const [status, setStatus] = useState<ImageLoadStatus>("loading");
  const [textureHandle, setTextureHandle] = useState<ImageTextureHandle | null>(
    null,
  );
  const scene = useMemo(
    () => (
      <Base2DScene>
        <ImageTexturePlane
          fit={fit}
          textureHandle={textureHandle}
          viewTransform={viewTransform}
        />
      </Base2DScene>
    ),
    [fit, textureHandle, viewTransform],
  );

  useEffect(() => {
    return () => {
      textureHandleRef.current?.dispose();
      textureHandleRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (frame.bytes.byteLength === 0) {
      hasVisibleImageRef.current = false;
      setStatus("error");
      replaceTextureHandle(null, textureHandleRef, setTextureHandle);
      return undefined;
    }

    let cancelled = false;
    if (!hasVisibleImageRef.current) {
      setStatus("loading");
    }

    createImageTexture(frame.bytes, frame.mimeType)
      .then((handle) => {
        if (cancelled) {
          handle.dispose();
          return;
        }

        replaceTextureHandle(handle, textureHandleRef, setTextureHandle);
        hasVisibleImageRef.current = true;
        setStatus("loaded");
        onImageLoadedRef.current?.(handle.imageWidth, handle.imageHeight);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        setStatus("error");
        hasVisibleImageRef.current = false;
        replaceTextureHandle(null, textureHandleRef, setTextureHandle);
      });

    return () => {
      cancelled = true;
    };
  }, [frame.bytes, frame.mimeType]);

  return (
    <div className={className} style={{ ...styles.panel, ...style }}>
      <WebGpuCanvas
        camera={ORTHOGRAPHIC_IMAGE_CAMERA}
        onError={setCanvasError}
        orthographic
        role="img"
        style={styles.canvas}
      >
        {scene}
      </WebGpuCanvas>

      {canvasError || status !== "loaded" ? (
        <div style={styles.status}>
          {canvasError ??
            (status === "error" ? "Image unavailable" : "Loading image")}
        </div>
      ) : null}
      {!canvasError && status === "loaded" && onResetView ? (
        <div style={styles.resetControls}>
          <button
            aria-label="Recenter image view"
            onClick={onResetView}
            onPointerDown={(event) => event.stopPropagation()}
            style={styles.resetButton}
            title="Recenter image view"
            type="button"
          >
            <Icon
              name={IconName.Move}
              size={Size.Xs}
              style={styles.resetButtonIcon}
            />
          </button>
        </div>
      ) : null}
    </div>
  );
}

function replaceTextureHandle(
  nextHandle: ImageTextureHandle | null,
  handleRef: MutableRefObject<ImageTextureHandle | null>,
  setHandle: (handle: ImageTextureHandle | null) => void,
) {
  const previousHandle = handleRef.current;
  if (previousHandle && previousHandle !== nextHandle) {
    previousHandle.dispose();
  }

  handleRef.current = nextHandle;
  setHandle(nextHandle);
}

const styles: Record<string, CSSProperties> = {
  canvas: {
    display: "block",
    height: "100%",
    width: "100%",
  },
  panel: {
    background: VISUALIZATION_PANEL_BACKGROUND_COLOR,
    boxSizing: "border-box",
    height: "100%",
    minHeight: 0,
    minWidth: 0,
    overflow: "hidden",
    position: "relative",
    width: "100%",
  },
  resetButton: {
    alignItems: "center",
    background: VISUALIZATION_HUD_BACKGROUND_COLOR,
    border: `1px solid ${VISUALIZATION_HUD_BORDER_COLOR}`,
    borderRadius: HUD_BORDER_RADIUS_PX,
    color: VISUALIZATION_HUD_TEXT_COLOR,
    cursor: "pointer",
    display: "inline-flex",
    height: 24,
    justifyContent: "center",
    padding: 0,
    width: 24,
  },
  resetButtonIcon: {
    flex: "0 0 auto",
    height: 13,
    width: 13,
  },
  resetControls: {
    alignItems: "flex-start",
    display: "flex",
    gap: 6,
    left: HUD_OFFSET_PX,
    position: "absolute",
    top: HUD_OFFSET_PX,
    zIndex: 2,
  },
  status: {
    alignItems: "center",
    color: VISUALIZATION_STATUS_TEXT_COLOR,
    display: "flex",
    fontSize: STATUS_FONT_SIZE_PX,
    inset: 0,
    justifyContent: "center",
    padding: STATUS_PADDING_PX,
    position: "absolute",
    textAlign: "center",
  },
};
