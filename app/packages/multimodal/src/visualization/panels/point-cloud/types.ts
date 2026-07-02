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
} from "../base-3d-scene";

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
   * Opaque shared image-texture cache key for `image` (formed with
   * `imageTextureCacheKey`). When present, the frustum image plane
   * acquires its texture from the shared cache, so surfaces showing the
   * same camera frame (e.g. the 2D image tile) share one decode and one
   * GPU texture. Without it the layer decodes privately per message.
   */
  readonly imageTextureKey?: string;
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
  readonly cameraPose?: PointCloudCameraPose | null;
  readonly className?: string;
  readonly colorBy?: PointCloudColorBy;
  readonly fit?: "initial" | "frame" | "never";
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
  readonly onCameraPoseChange?: (
    pose: PointCloudCameraPose,
    source: ThreeCameraPoseChangeSource,
  ) => void;
  readonly onRenderStats?: (stats: PointCloudPanelRenderStats) => void;
  readonly pointSize?: number;
  readonly showGizmo?: boolean;
  readonly showHud?: boolean;
  readonly style?: CSSProperties;
  /**
   * Diagnostic notices (transform availability, placement fallbacks).
   * Rendered as a compact corner chip that expands on demand instead of
   * a free-floating text block.
   */
  readonly warnings?: readonly string[];
}
