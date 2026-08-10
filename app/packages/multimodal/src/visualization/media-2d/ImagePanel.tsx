import type { CSSProperties, ReactNode } from "react";
import { useCallback, useMemo } from "react";

import type { ImageVisualization } from "../../ir";
import {
  Base2dScene,
  ImageTexturePlane,
  type ImageTextureMesh,
  type ImageViewTransform,
} from "./Base2dScene";
import {
  hasImageData,
  imageIdentity,
  useImageTextureLease,
} from "./use-image-texture-lease";
import {
  EMPTY_PANEL_NOTICES,
  type PanelNotice,
} from "../panel-ui/PanelNotices";
import { MEDIA_2D_STATUS_STYLE, Media2dPanelShell } from "./Media2dPanelShell";

/**
 * Props for rendering one decoded image visualization frame.
 */
export interface ImagePanelProps {
  readonly alt?: string;
  /**
   * Device-registry surface tag passed through to the WebGPU canvas
   * ("modal-image", "grid-preview", ...). Bookkeeping only.
   */
  readonly canvasSurface?: string;
  readonly className?: string;
  readonly fit?: "contain" | "cover";
  readonly frame: ImageVisualization;
  /** Diagnostics rendered in the bottom-left expandable notice control. */
  readonly notices?: readonly PanelNotice[];
  readonly onImageLoaded?: (width: number, height: number) => void;
  readonly onResetView?: () => void;
  /** R3F scene content rendered in normalized image coordinates. */
  readonly sceneChildren?: ReactNode;
  readonly style?: CSSProperties;
  /** Optional cached mesh that remaps the source texture into display pixels. */
  readonly textureMesh?: ImageTextureMesh | null;
  /**
   * Opaque shared image-texture cache key for `frame` (callers with
   * message identity form it with `imageTextureCacheKey`). When present,
   * the decode goes through the shared cache — surfaces showing the same
   * frame (e.g. a 3D frustum image plane) share one decode while receiving
   * separate texture leases, and batch re-delivery of the same message in a
   * fresh wrapper does not re-decode. When absent, each new frame data
   * identity decodes privately (grid previews carry no message identity).
   */
  readonly textureKey?: string;
  readonly viewTransform?: ImageViewTransform;
}

/**
 * Production image visualization panel backed by a stable Three.js canvas.
 */
export function ImagePanel({
  alt = "Image",
  canvasSurface,
  className,
  fit = "contain",
  frame,
  notices = EMPTY_PANEL_NOTICES,
  onImageLoaded,
  onResetView,
  sceneChildren,
  style,
  textureMesh,
  textureKey,
  viewTransform,
}: ImagePanelProps) {
  const {
    errorMessage,
    handle: textureHandle,
    status,
  } = useImageTextureLease({
    disabledStatus: "error",
    enabled: hasImageData(frame),
    frame,
    identity: textureKey ?? imageIdentity(frame),
    onLoaded: (handle) => {
      onImageLoaded?.(handle.imageWidth, handle.imageHeight);
    },
    textureKey,
  });
  const renderScene = useCallback(
    (useSharedView: boolean) => (
      <Base2dScene background={!useSharedView}>
        <ImageTexturePlane
          fit={fit}
          textureMesh={textureMesh}
          textureHandle={textureHandle}
          viewTransform={viewTransform}
        >
          {sceneChildren}
        </ImageTexturePlane>
      </Base2dScene>
    ),
    [fit, sceneChildren, textureHandle, textureMesh, viewTransform],
  );
  const panelNotices = useMemo<readonly PanelNotice[]>(() => {
    if (status === "error") {
      const message = errorMessage ?? "Image unavailable";
      return [
        ...notices,
        {
          id: "image-texture",
          message,
          severity: "error",
        },
      ];
    }
    return notices;
  }, [errorMessage, notices, status]);

  return (
    <Media2dPanelShell
      alt={alt}
      canvasNoticeId="image-canvas"
      canvasSurface={canvasSurface}
      className={className}
      notices={panelNotices}
      onResetView={onResetView}
      resetReady={status === "loaded"}
      resetTitle="Recenter the image view"
      status={
        status === "loading" ? (
          <div style={MEDIA_2D_STATUS_STYLE}>Loading image</div>
        ) : undefined
      }
      style={style}
    >
      {renderScene}
    </Media2dPanelShell>
  );
}
