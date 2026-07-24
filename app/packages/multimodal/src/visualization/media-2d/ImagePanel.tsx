import { Icon, IconName, Size } from "@voxel51/voodo";
import { OrthographicCamera } from "@react-three/drei";
import type { CSSProperties, ReactNode } from "react";
import { useMemo, useState } from "react";

import type { ImageVisualization } from "../../ir";
import {
  Base2dScene,
  ImageTexturePlane,
  type ImageTextureMesh,
  type ImageViewTransform,
} from "./Base2dScene";
import {
  VISUALIZATION_HUD_BACKGROUND_COLOR,
  VISUALIZATION_HUD_BORDER_COLOR,
  VISUALIZATION_HUD_TEXT_COLOR,
  VISUALIZATION_PANEL_BACKGROUND_COLOR,
  VISUALIZATION_STATUS_TEXT_COLOR,
} from "../panel-ui/style-tokens";
import {
  hasImageData,
  imageIdentity,
  useImageTextureLease,
} from "./use-image-texture-lease";
import { WebGpuCanvas } from "../webgpu/WebGpuCanvas";
import { useWebGpuViewStage, WebGpuView } from "../webgpu/WebGpuViewStage";
import {
  EMPTY_PANEL_NOTICES,
  PanelNotices,
  type PanelNotice,
} from "../panel-ui/PanelNotices";
import controlStyles from "../panel-ui/PanelControl.module.css";

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
  /** Ordered H.264 frames from the preceding keyframe to just before `frame`. */
  readonly decodeRunway?: readonly ImageVisualization[];
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
  decodeRunway,
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
  const [canvasError, setCanvasError] = useState<string | null>(null);
  const sharedStage = useWebGpuViewStage();
  const useSharedView = sharedStage !== null && sharedStage.error === null;
  const {
    errorKind,
    errorMessage,
    handle: textureHandle,
    status,
  } = useImageTextureLease({
    decodeRunway,
    disabledStatus: "error",
    enabled: hasImageData(frame),
    frame,
    identity: textureKey ?? imageIdentity(frame),
    onLoaded: (handle) => {
      onImageLoaded?.(handle.imageWidth, handle.imageHeight);
    },
    textureKey,
  });
  const scene = useMemo(
    () => (
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
    [
      fit,
      sceneChildren,
      textureHandle,
      textureMesh,
      useSharedView,
      viewTransform,
    ],
  );
  const panelNotices = useMemo<readonly PanelNotice[]>(() => {
    if (canvasError) {
      return [
        ...notices,
        {
          id: "image-canvas",
          message: canvasError,
          severity: "error",
        },
      ];
    }
    if (status === "error") {
      const message = errorMessage ?? "Image unavailable";
      return [
        ...notices,
        {
          id: "image-texture",
          message,
          severity: errorKind === "waiting" ? "info" : "error",
        },
      ];
    }
    return notices;
  }, [canvasError, errorKind, errorMessage, notices, status]);

  return (
    <div
      className={className}
      style={{
        ...styles.panel,
        ...(useSharedView ? styles.sharedPanel : null),
        ...style,
      }}
    >
      {useSharedView ? (
        <WebGpuView aria-label={alt} role="img" style={styles.canvas}>
          <OrthographicCamera
            far={ORTHOGRAPHIC_IMAGE_CAMERA.far}
            makeDefault
            near={ORTHOGRAPHIC_IMAGE_CAMERA.near}
            position={ORTHOGRAPHIC_IMAGE_CAMERA.position}
            zoom={ORTHOGRAPHIC_IMAGE_CAMERA.zoom}
          />
          {scene}
        </WebGpuView>
      ) : (
        <WebGpuCanvas
          aria-label={alt}
          camera={ORTHOGRAPHIC_IMAGE_CAMERA}
          onError={setCanvasError}
          orthographic
          role="img"
          style={styles.canvas}
          surface={canvasSurface}
        >
          {scene}
        </WebGpuCanvas>
      )}

      {!canvasError && status === "loading" ? (
        <div style={styles.status}>Loading image</div>
      ) : null}
      {!canvasError && status === "loaded" && onResetView ? (
        <div style={styles.resetControls}>
          <button
            aria-label="Recenter view"
            className={controlStyles.button}
            onClick={onResetView}
            onPointerDown={(event) => event.stopPropagation()}
            style={styles.resetButton}
            title="Recenter the image view"
            type="button"
          >
            <Icon
              name={IconName.Fullscreen}
              size={Size.Xs}
              style={styles.resetButtonIcon}
            />
          </button>
        </div>
      ) : null}
      <PanelNotices notices={panelNotices} scope="image" />
    </div>
  );
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
  sharedPanel: {
    background: "transparent",
  },
  // Mirrors the 3D panel's recenter control (bottom-right, 24×24,
  // Fullscreen glyph) so every tile shares one recenter interface.
  resetControls: {
    alignItems: "flex-start",
    bottom: HUD_OFFSET_PX,
    display: "flex",
    gap: 6,
    position: "absolute",
    right: HUD_OFFSET_PX,
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
