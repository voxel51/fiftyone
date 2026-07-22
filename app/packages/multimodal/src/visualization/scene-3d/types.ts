import type { CSSProperties, ReactNode } from "react";
import * as THREE from "three";

import type {
  CameraCalibrationVisualization,
  GridVisualization,
  ImageVisualization,
  PointCloudVisualization,
  SceneUpdateVisualization,
} from "../../ir";
import type {
  ThreeCameraPose,
  ThreeCameraPoseChangeSource,
  ThreeSceneBackground,
  ThreeSceneUpAxis,
} from "./base-3d-scene";
import type { PointCloudColormap } from "./colormap-types";
import type { PanelNotice } from "../panel-ui/panel-notices";

export type {
  PanelNotice,
  PanelNoticeSeverity,
} from "../panel-ui/panel-notices";

/**
 * Point-cloud colouring modes. Besides the reserved modes ("auto",
 * "height", "rgb", "uniform"), any decoded per-point scalar channel name
 * (e.g. "intensity", "ring", "vx_comp") selects that channel's ramp;
 * matching is case- and punctuation-insensitive.
 */
export type PointCloudColorBy =
  | "auto"
  | "height"
  | "rgb"
  | "uniform"
  // Intersection keeps the literal modes in autocomplete while accepting
  // arbitrary channel names.
  | (string & NonNullable<unknown>);

/**
 * Per-layer colour configuration. All fields optional: omitted fields
 * fall back to auto channel selection, the default colormap, and
 * per-frame min/max normalization.
 */
export interface PointCloudColorSettings {
  readonly colorBy?: PointCloudColorBy;
  readonly colormap?: PointCloudColormap;
  /** Hex color (#rrggbb) used when `colorBy` is "uniform". */
  readonly uniformColor?: string;
  /**
   * Fixed normalization range. Applied only when both ends are finite
   * and min < max; values outside clamp to the ramp ends.
   */
  readonly rangeMax?: number;
  readonly rangeMin?: number;
}

/**
 * The scalar ramp a rendered cloud actually used, for legend display.
 * Null on the render data when the cloud drew RGB/uniform colors.
 */
export interface PointCloudColorRamp {
  readonly colormap: PointCloudColormap;
  /** Channel driving the ramp: a scalar field's name, or "height". */
  readonly fieldLabel: string;
  readonly maxValue: number;
  readonly minValue: number;
}

export interface PointCloudRenderData {
  readonly bounds: THREE.Box3;
  readonly colorRamp: PointCloudColorRamp | null;
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

/** Perspective projection parameters for an interactive point-cloud view. */
export interface PointCloudCameraProjection {
  /** Vertical field of view in degrees. */
  readonly fovDegrees: number;
  readonly near: number;
  readonly far: number;
}

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
 * One picked cloud point, reported in the layer's decoded index space
 * (see `sourcePointIndexForRenderedIndex` — rendered geometry is
 * downsampled and compacted, so rendered indexes are never exposed).
 */
export interface PointCloudPointPick {
  /** The point's rendered (colormapped) color, normalized RGB. */
  readonly color: readonly [number, number, number] | null;
  /** Index into the layer frame's positions/scalarFields arrays. */
  readonly pointIndex: number;
  /** Picked vertex in the panel's fixed (world) frame. */
  readonly worldPosition: readonly [number, number, number];
}

/**
 * Emphasis marker for the hovered cloud point: rendered over the point
 * in its complementary color, slightly enlarged.
 */
export interface PointCloudHoveredPointMarker {
  /** The point's rendered color the emphasis complements. */
  readonly color: readonly [number, number, number] | null;
  /** Sensor-frame coordinates of the hovered point. */
  readonly position: readonly [number, number, number];
}

/**
 * One point cloud rendered into the shared panel scene. `id` is the stable
 * source identity used for React reconciliation and per-layer point counting;
 * `contentTimeNs` identifies the current source message so GPU resources can
 * survive playback re-delivering it in a fresh wrapper object.
 */
export interface PointCloudPanelLayer {
  /**
   * Layer-specific colour configuration; overrides the panel-level
   * `colorBy` prop for this cloud only.
   */
  readonly colorSettings?: PointCloudColorSettings;
  readonly contentTimeNs?: bigint;
  readonly frame: PointCloudVisualization;
  readonly frameTransform?: PointCloudFrameTransform;
  readonly id: string;
  /**
   * Makes the cloud's points inspectable on hover: called with the
   * dwelled-on point once the pointer rests over it (entities and
   * frustums take precedence; measure mode suspends picking entirely),
   * and with null when the pointer moves on.
   */
  readonly onHoverPoint?: (pick: PointCloudPointPick | null) => void;
  /** Hovered-point emphasis to render over this cloud, if any. */
  readonly hoveredPoint?: PointCloudHoveredPointMarker | null;
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

/** One transient, noninteractive ray rendered in a source coordinate frame. */
export interface SceneRayPanelLayer {
  /** Packed RGB color used by the line and endpoint marker. */
  readonly color?: number;
  readonly end: readonly [number, number, number];
  readonly frameTransform?: PointCloudFrameTransform;
  readonly id: string;
  readonly start: readonly [number, number, number];
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

/** Stable calibrated pixel-to-camera-ray contract for 3D camera geometry. */
export interface CameraImageRayModel {
  readonly height: number;
  readonly rayForPixel: (
    u: number,
    v: number,
  ) => readonly [number, number, number] | null;
  readonly width: number;
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
  /** Exact model used for ray-derived boundaries and the textured ray surface. */
  readonly cameraRayModel?: CameraImageRayModel;
  /** Withhold the frustum instead of falling back to a pinhole approximation. */
  readonly requireCameraRayModel?: boolean;
  readonly contentTimeNs?: bigint;
  /** Ordered H.264 frames needed to initialize decoding before `image`. */
  readonly imageDecodeRunway?: readonly ImageVisualization[];
  /** Why the image plane is unavailable while the wireframe remains usable. */
  readonly imageUnavailableReason?: string;
  readonly frame: CameraCalibrationVisualization;
  readonly frameTransform?: PointCloudFrameTransform;
  readonly id: string;
  readonly image?: ImageVisualization;
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
   * decoded source while receiving separate texture leases. Without it
   * the layer decodes privately per message.
   */
  readonly imageTextureKey?: string;
  /** Image stream this frustum's camera feeds (host-defined). */
  readonly imageStream?: string;
  /** Base wireframe/image-plane opacity in [0, 1]. */
  readonly opacity?: number;
  /** Emphasize the frustum wireframe (e.g. its camera tile is hovered). */
  readonly highlighted?: boolean;
  /**
   * Selected-state emphasis (e.g. its camera tile is focused): renders
   * the wireframe dashed, distinguishing it from a transient hover.
   */
  readonly selected?: boolean;
  /** Reports direct pointer hover over the frustum or textured image plane. */
  readonly onHover?: (hovered: boolean) => void;
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
  readonly sceneBounds?: PointCloudSceneBoundsSummary;
}

/** Compact world-space bounds exposed to camera composition callers. */
export interface PointCloudSceneBoundsSummary {
  readonly center: readonly [number, number, number];
  readonly radius: number;
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
  /**
   * Externally supplied camera pose, applied whenever it differs from the
   * live scene pose. Callers may drive it as a controlled pose (grid
   * previews do) or as a rare command channel — restore/remap/preset poses
   * only — with interactive motion owned imperatively inside the canvas via
   * `cameraRig` (the modal 3D tile does).
   */
  readonly cameraPose?: PointCloudCameraPose | null;
  /** Perspective projection override; defaults to the panel camera preset. */
  readonly cameraProjection?: PointCloudCameraProjection;
  /**
   * Optional camera controller mounted inside the canvas (rendered as a
   * child of the shared 3D scene). Lets callers own camera behavior
   * imperatively — e.g. the MCAP follow-mode rig — while the panel stays
   * generic.
   */
  readonly cameraRig?: ReactNode;
  /**
   * Caller-specific buttons rendered above the built-in measure and recenter
   * actions in the bottom-right control stack.
   */
  readonly controls?: ReactNode;
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
  /** Transient rays excluded from fitting, counts, and scene picking. */
  readonly rayLayers?: readonly SceneRayPanelLayer[];
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
  /** World axis treated as up by the shared 3D scene. @default "z" */
  readonly sceneUp?: ThreeSceneUpAxis;
  readonly showGizmo?: boolean;
  /**
   * Whether to render the scalar-ramp legend in the top-left corner.
   * Defaults off; callers opt in from their own settings surface.
   */
  readonly showColorLegend?: boolean;
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
   * Whether to render the interactive HUD control stack (caller controls,
   * recenter, and measure). Modal surfaces keep it; grid previews turn it off.
   * @default true
   */
  readonly showControls?: boolean;
  readonly style?: CSSProperties;
}
