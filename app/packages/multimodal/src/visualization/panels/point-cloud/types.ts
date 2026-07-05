import type { CSSProperties } from "react";
import * as THREE from "three";

import type {
  CameraCalibrationVisualization,
  EncodedImageVisualization,
  GridVisualization,
  PointCloudVisualization,
  SceneUpdateVisualization,
} from "../../../decoders";
import type {
  ThreeCameraPose,
  ThreeCameraPoseChangeSource,
  ThreeSceneBackground,
} from "../base-3d-scene";

export type PanelNoticeSeverity = "error" | "info" | "warning";

/**
 * Render shape for one diagnostic notice in the panel's collapsed chip.
 * The panel is a generic visualization layer: producers (e.g. the MCAP
 * tile) map their richer health models onto this shape. `id` is the
 * stable identity used for row reconciliation — message/detail update in
 * place without remounting the row, which is what keeps churning frame
 * lists from blinking the chip.
 */
export interface PanelNotice {
  /** Volatile specifics (frame-id lists, durations), rendered dimmer. */
  readonly detail?: string;
  readonly id: string;
  /** Short, stable description of the condition. */
  readonly message: string;
  readonly severity: PanelNoticeSeverity;
}

/**
 * Supported point-cloud colouring modes.
 */
export type PointCloudColorBy =
  | "auto"
  | "height"
  | "intensity"
  | "rcs"
  | "reflectance"
  | "reflectivity"
  | "rgb"
  | "uniform";

export interface PointCloudRenderData {
  readonly bounds: THREE.Box3;
  readonly colors: Float32Array;
  readonly finitePointCount: number;
  readonly positions: Float32Array;
  readonly renderedPointCount: number;
}

export interface PointCloudRenderLayer {
  readonly data: PointCloudRenderData;
  readonly layer: PointCloudPanelLayer;
}

export interface PointCloudObjectTransform {
  readonly position: [number, number, number];
  readonly quaternion: [number, number, number, number];
}

export interface SceneAnnotationPrimitiveSummary {
  readonly arrowCount: number;
  readonly cubeCount: number;
  readonly cylinderCount: number;
  readonly lineCount: number;
  readonly modelCount: number;
  readonly sphereCount: number;
  readonly textCount: number;
  readonly totalCount: number;
  readonly triangleCount: number;
}

export interface SceneIndexedGeometryRenderData {
  readonly geometry: THREE.BufferGeometry;
  readonly usesVertexColors: boolean;
}

export interface TextSpriteTexture {
  readonly aspectRatio: number;
  /**
   * Ratio of the full sprite height (line height + padding) to one unit of
   * font size, so display scale can target the requested glyph height.
   */
  readonly heightPerFontUnit: number;
  readonly texture: THREE.Texture;
}

/**
 * Transform from a point-cloud frame into the panel's fixed frame.
 */
export interface PointCloudFrameTransform {
  readonly resolutionKind?: string;
  readonly rotation: THREE.Quaternion;
  readonly sourceFrameId: string;
  readonly targetFrameId: string;
  readonly translation: THREE.Vector3;
}

/**
 * Camera pose shared by controlled point-cloud panels.
 */
export type PointCloudCameraPose = ThreeCameraPose;

/**
 * Appearance of the panel's world reference grid. Every field has a
 * sensible default; pass `{}` for the stock grid.
 */
export interface WorldGridPanelConfig {
  /** Peak line opacity in [0, 1]. */
  readonly opacity?: number;
  /** Closest line spacing in scene units; lines adapt by powers of ten. */
  readonly spacing?: number;
  /** World up axis the grid plane is perpendicular to. @default "z" */
  readonly up?: "x" | "y" | "z";
}

/**
 * One point cloud rendered into the shared panel scene. `id` is the
 * stable identity used for React reconciliation and per-layer point
 * counting — use the source's topic/stream id.
 */
export interface PointCloudPanelLayer {
  readonly frame: PointCloudVisualization;
  readonly frameTransform?: PointCloudFrameTransform;
  readonly id: string;
}

/**
 * One transformed 3D annotation layer rendered into the shared scene.
 */
export interface SceneAnnotationPanelLayer {
  readonly frame: SceneUpdateVisualization;
  readonly frameTransform?: PointCloudFrameTransform;
  readonly id: string;
  /** Source stream/topic that produced this layer (host-defined). */
  readonly sourceId?: string;
  /** Emphasize this layer's entities (selection / cross-tile echo). */
  readonly highlighted?: boolean;
  /**
   * Makes the layer's entities clickable: called with the picked
   * entity's id (or the entity index as a string when it has none) on
   * a non-drag click, plus the click's modifier state (hosts widen
   * selection scope on shift).
   */
  readonly onSelectEntity?: (
    entityId: string,
    modifiers: { readonly shiftKey: boolean },
  ) => void;
  /**
   * Hover reporting for tooltips: called with the entity id when the
   * pointer enters one of this layer's entities, and `null` when it
   * leaves.
   */
  readonly onHoverEntity?: (entityId: string | null) => void;
}

/**
 * One grid (map) layer rendered as a textured ground plane in the shared
 * scene. `contentTimeNs` identifies the source message so the GPU texture
 * survives playback re-delivering the same message in new wrapper objects.
 */
export interface GridPanelLayer {
  readonly contentTimeNs?: bigint;
  readonly frame: GridVisualization;
  readonly frameTransform?: PointCloudFrameTransform;
  readonly id: string;
}

/**
 * One camera calibration rendered as a wireframe frustum in the shared
 * scene, optionally carrying the camera's current encoded image to
 * texture the frustum's image plane. `contentTimeNs` /
 * `imageContentTimeNs` identify the source messages so GPU resources
 * survive playback re-delivering the same messages in new wrapper
 * objects.
 */
export interface CameraFrustumPanelLayer {
  readonly contentTimeNs?: bigint;
  readonly frame: CameraCalibrationVisualization;
  readonly frameTransform?: PointCloudFrameTransform;
  readonly id: string;
  readonly image?: EncodedImageVisualization;
  readonly imageContentTimeNs?: bigint;
  /**
   * Presentational distance from optical center to image plane, in scene
   * units. This scales the rendered frustum without changing data placement.
   */
  readonly imagePlaneDepthM?: number;
  /**
   * Opaque shared image-texture cache key for `image` (formed with
   * `imageTextureCacheKey`). When present, the frustum image plane
   * acquires its texture from the shared cache, so surfaces showing the
   * same camera frame (e.g. the 2D image tile) share one decode and one
   * GPU texture. Without it the layer decodes privately per message.
   */
  readonly imageTextureKey?: string;
  /** Image stream this frustum's camera feeds (host-defined). */
  readonly imageTopic?: string;
  /** Base wireframe/image-plane opacity in [0, 1]. */
  readonly opacity?: number;
  /** Emphasize the frustum wireframe (e.g. its camera tile is hovered). */
  readonly highlighted?: boolean;
  /** Makes the frustum clickable — called on a non-drag click. */
  readonly onSelect?: (modifiers: { readonly metaKey: boolean }) => void;
}

export interface PointCloudPanelRenderStats {
  readonly annotationCubeCount: number;
  readonly annotationEntityCount: number;
  readonly annotationLayerCount: number;
  readonly annotationPrimitiveCount: number;
  readonly cameraPose?: PointCloudCameraPose;
  readonly cameraPoseSource: "controlled" | "fitted" | "none";
  readonly declaredPointCount: number;
  readonly finitePointCount: number;
  readonly frustumLayerCount: number;
  readonly gridLayerCount: number;
  readonly layerCount: number;
  readonly renderedPointCount: number;
}

/**
 * Props for rendering decoded point-cloud visualization frames. A panel
 * renders one shared 3D scene; each layer contributes one cloud to it.
 */
export interface PointCloudPanelProps {
  /**
   * Scene backdrop: one flat color or a vertical gradient. Defaults to
   * the shared dark panel color.
   */
  readonly background?: ThreeSceneBackground;
  readonly cameraPose?: PointCloudCameraPose | null;
  /**
   * Device-registry surface tag passed through to the WebGPU canvas
   * ("modal-3d", "grid-preview", ...). Bookkeeping only.
   */
  readonly canvasSurface?: string;
  readonly className?: string;
  readonly colorBy?: PointCloudColorBy;
  readonly fit?: "initial" | "frame" | "never";
  /**
   * Identity of the coordinate context the layers are expressed in (e.g.
   * the world frame id). When it changes, a captured `initial` fit pose is
   * discarded and re-captured from the re-placed layers, so the fit
   * fallback never frames coordinates from a stale frame.
   */
  readonly fitResetKey?: string;
  readonly annotationLayers?: readonly SceneAnnotationPanelLayer[];
  readonly frustumLayers?: readonly CameraFrustumPanelLayer[];
  readonly gridLayers?: readonly GridPanelLayer[];
  /**
   * Extra playback-synced telemetry lines rendered under the HUD count
   * label (speed, coordinates). Threaded down from the tile because
   * telemetry is stream state the panel has no business deriving.
   */
  readonly hudLines?: readonly string[];
  readonly layers: readonly PointCloudPanelLayer[];
  readonly maxRenderedPoints?: number;
  /**
   * Diagnostic notices (transform availability, placement fallbacks).
   * Rendered as a compact corner chip that expands on demand instead of
   * a free-floating text block. Keyed by `PanelNotice.id`.
   */
  readonly notices?: readonly PanelNotice[];
  readonly onCameraPoseChange?: (
    pose: PointCloudCameraPose,
    source: ThreeCameraPoseChangeSource,
  ) => void;
  readonly onRenderStats?: (stats: PointCloudPanelRenderStats) => void;
  readonly pointSize?: number;
  readonly showGizmo?: boolean;
  readonly showHud?: boolean;
  /**
   * Renders an adaptive reference grid on the world ground plane when
   * set (minor lines every `spacing` units, cardinal lines every ten,
   * spacing scales by powers of ten with camera distance). Purely
   * visual: it never occludes content, intercepts picks, or affects
   * fit bounds. Omit (or pass null) to hide the grid.
   */
  readonly worldGrid?: WorldGridPanelConfig | null;
  /**
   * Whether to render the interactive HUD controls (recenter, measure).
   * Modal surfaces keep them; grid previews turn them off.
   * @default true
   */
  readonly showControls?: boolean;
  readonly style?: CSSProperties;
}
