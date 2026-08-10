import { OrthographicCamera } from "@react-three/drei";
import { Icon, IconName, Size } from "@voxel51/voodo";
import { useMemo, useState, type CSSProperties, type ReactNode } from "react";

import {
  EMPTY_PANEL_NOTICES,
  PanelNotices,
  type PanelNotice,
  type PanelNoticeScope,
} from "../panel-ui/PanelNotices";
import controlStyles from "../panel-ui/PanelControl.module.css";
import {
  VISUALIZATION_HUD_BACKGROUND_COLOR,
  VISUALIZATION_HUD_BORDER_COLOR,
  VISUALIZATION_HUD_TEXT_COLOR,
  VISUALIZATION_PANEL_BACKGROUND_COLOR,
  VISUALIZATION_STATUS_TEXT_COLOR,
} from "../panel-ui/style-tokens";
import { WebGpuCanvas } from "../webgpu/WebGpuCanvas";
import { useWebGpuViewStage, WebGpuView } from "../webgpu/WebGpuViewStage";

const ORTHOGRAPHIC_MEDIA_CAMERA = {
  far: 10,
  near: -10,
  position: [0, 0, 1] as [number, number, number],
  zoom: 1,
};

export interface Media2dPanelShellProps {
  readonly alt: string;
  readonly canvasNoticeId: string;
  readonly canvasSurface?: string;
  readonly children: (usesSharedView: boolean) => ReactNode;
  readonly className?: string;
  readonly notices?: readonly PanelNotice[];
  readonly noticeScope?: PanelNoticeScope;
  readonly onResetView?: () => void;
  readonly resetReady?: boolean;
  readonly resetTitle: string;
  readonly status?: ReactNode;
  readonly style?: CSSProperties;
}

/** Stable WebGPU/view/HUD shell shared by still-image and video panels. */
export function Media2dPanelShell({
  alt,
  canvasNoticeId,
  canvasSurface,
  children,
  className,
  notices = EMPTY_PANEL_NOTICES,
  noticeScope = "image",
  onResetView,
  resetReady = false,
  resetTitle,
  status,
  style,
}: Media2dPanelShellProps) {
  const [canvasError, setCanvasError] = useState<string | null>(null);
  const sharedStage = useWebGpuViewStage();
  const useSharedView = sharedStage !== null && sharedStage.error === null;
  const panelNotices = useMemo<readonly PanelNotice[]>(
    () =>
      canvasError
        ? [
            ...notices,
            {
              id: canvasNoticeId,
              message: canvasError,
              severity: "error" as const,
            },
          ]
        : notices,
    [canvasError, canvasNoticeId, notices],
  );
  const scene = children(useSharedView);

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
            far={ORTHOGRAPHIC_MEDIA_CAMERA.far}
            makeDefault
            near={ORTHOGRAPHIC_MEDIA_CAMERA.near}
            position={ORTHOGRAPHIC_MEDIA_CAMERA.position}
            zoom={ORTHOGRAPHIC_MEDIA_CAMERA.zoom}
          />
          {scene}
        </WebGpuView>
      ) : (
        <WebGpuCanvas
          aria-label={alt}
          camera={ORTHOGRAPHIC_MEDIA_CAMERA}
          onError={setCanvasError}
          orthographic
          role="img"
          style={styles.canvas}
          surface={canvasSurface}
        >
          {scene}
        </WebGpuCanvas>
      )}

      {!canvasError ? status : null}
      {!canvasError && resetReady && onResetView ? (
        <div style={styles.resetControls}>
          <button
            aria-label="Recenter view"
            className={controlStyles.button}
            onClick={onResetView}
            onPointerDown={(event) => event.stopPropagation()}
            style={styles.resetButton}
            title={resetTitle}
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
      <PanelNotices notices={panelNotices} scope={noticeScope} />
    </div>
  );
}

export const MEDIA_2D_STATUS_STYLE: CSSProperties = {
  alignItems: "center",
  color: VISUALIZATION_STATUS_TEXT_COLOR,
  display: "flex",
  fontSize: 13,
  inset: 0,
  justifyContent: "center",
  padding: 16,
  position: "absolute",
  textAlign: "center",
};

const styles: Record<string, CSSProperties> = {
  canvas: { display: "block", height: "100%", width: "100%" },
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
    borderRadius: 4,
    color: VISUALIZATION_HUD_TEXT_COLOR,
    cursor: "pointer",
    display: "inline-flex",
    height: 24,
    justifyContent: "center",
    padding: 0,
    width: 24,
  },
  resetButtonIcon: { flex: "0 0 auto", height: 13, width: 13 },
  resetControls: {
    alignItems: "flex-start",
    bottom: 8,
    display: "flex",
    gap: 6,
    position: "absolute",
    right: 8,
    zIndex: 2,
  },
  sharedPanel: { background: "transparent" },
};
