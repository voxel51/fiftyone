import {
  useCallback,
  useMemo,
  type CSSProperties,
  type ReactNode,
} from "react";

import type { EncodedH264VideoVisualization } from "../../ir";
import { useVideoStreamPresentation } from "../../video/react";
import type { VideoIntentPriority } from "../../video/types";
import {
  Base2dScene,
  ImageTexturePlane,
  type ImageTextureMesh,
  type ImageViewTransform,
} from "./Base2dScene";
import { useVideoTexture } from "./use-video-texture";
import {
  EMPTY_PANEL_NOTICES,
  type PanelNotice,
} from "../panel-ui/PanelNotices";
import { MEDIA_2D_STATUS_STYLE, Media2dPanelShell } from "./Media2dPanelShell";

export interface VideoPanelProps {
  readonly alt?: string;
  readonly canvasSurface?: string;
  readonly className?: string;
  readonly fit?: "contain" | "cover";
  readonly frame: EncodedH264VideoVisualization;
  readonly notices?: readonly PanelNotice[];
  readonly onImageLoaded?: (width: number, height: number) => void;
  readonly onResetView?: () => void;
  readonly priority?: VideoIntentPriority;
  readonly sceneChildren?: ReactNode;
  readonly stream: string;
  readonly style?: CSSProperties;
  readonly targetTimeNs: bigint;
  readonly textureMesh?: ImageTextureMesh | null;
  readonly viewTransform?: ImageViewTransform;
}

/** Dedicated H.264 sibling of ImagePanel backed by the source video engine. */
export function VideoPanel({
  alt = "Video",
  canvasSurface,
  className,
  fit = "contain",
  frame,
  notices = EMPTY_PANEL_NOTICES,
  onImageLoaded,
  onResetView,
  priority = "visible",
  sceneChildren,
  stream,
  style,
  targetTimeNs,
  textureMesh,
  viewTransform,
}: VideoPanelProps) {
  const snapshot = useVideoStreamPresentation({
    frame,
    priority,
    stream,
    targetTimeNs,
  });
  const textureHandle = useVideoTexture(snapshot.presentation, (handle) => {
    onImageLoaded?.(handle.imageWidth, handle.imageHeight);
  });
  const renderScene = useCallback(
    (useSharedView: boolean) => (
      <Base2dScene background={!useSharedView}>
        <ImageTexturePlane
          fit={fit}
          textureHandle={textureHandle}
          textureMesh={textureMesh}
          viewTransform={viewTransform}
        >
          {sceneChildren}
        </ImageTexturePlane>
      </Base2dScene>
    ),
    [fit, sceneChildren, textureHandle, textureMesh, viewTransform],
  );
  const panelNotices = useMemo<readonly PanelNotice[]>(() => {
    const next = [...notices];
    if (snapshot.diagnostic) {
      next.push({
        id: "video-engine",
        message: snapshot.diagnostic.message,
        severity: snapshot.diagnostic.severity,
      });
    }
    return next;
  }, [notices, snapshot.diagnostic]);

  return (
    <Media2dPanelShell
      alt={alt}
      canvasNoticeId="video-canvas"
      canvasSurface={canvasSurface}
      className={className}
      notices={panelNotices}
      noticeScope="video"
      onResetView={onResetView}
      resetReady={Boolean(textureHandle)}
      resetTitle="Recenter the video view"
      status={
        !textureHandle && snapshot.diagnostic?.severity !== "error" ? (
          <div style={MEDIA_2D_STATUS_STYLE}>Preparing video</div>
        ) : undefined
      }
      style={style}
    >
      {renderScene}
    </Media2dPanelShell>
  );
}
