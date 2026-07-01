/* eslint-disable react/no-unknown-property */
import { useThree } from "@react-three/fiber";
import { Icon, IconName, Size } from "@voxel51/voodo";
import { MeshoptDecoder } from "meshoptimizer";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

import type {
  CameraCalibrationVisualization,
  EncodedImageVisualization,
  GridVisualization,
  PointCloudScalarField,
  PointCloudVisualization,
  RgbaColor,
  SceneArrowPrimitive,
  SceneCubePrimitive,
  SceneCylinderPrimitive,
  SceneLinePrimitive,
  SceneModelPrimitive,
  ScenePoint3D,
  ScenePose3D,
  SceneSpherePrimitive,
  SceneTextPrimitive,
  SceneTrianglePrimitive,
  SceneUpdateVisualization,
} from "../../decoders";
import {
  Base3DScene,
  type ThreeCameraPose,
  type ThreeCameraPoseChangeSource,
} from "./base-3d-scene";
import type { ImageTextureHandle } from "./base-2d-scene";
import { createImageTexture } from "./image-texture";
import {
  VISUALIZATION_HUD_BACKGROUND_COLOR,
  VISUALIZATION_HUD_BORDER_COLOR,
  VISUALIZATION_HUD_TEXT_COLOR,
  VISUALIZATION_PANEL_BACKGROUND_COLOR,
  VISUALIZATION_STATUS_TEXT_COLOR,
} from "./style-tokens";
import { WebGpuCanvas } from "./webgpu-canvas";

// Initial camera pose: elevated and offset so the full scene is in view.
const PERSPECTIVE_POINT_CAMERA = {
  far: 10000,
  fov: 50,
  near: 0.01,
  position: [8, 5, 8] as [number, number, number],
};
// Render budget: beyond ~120k points the GPU cost outweighs the visual gain
// for typical LiDAR frames. Points are uniformly sampled down to this limit.
const DEFAULT_MAX_RENDERED_POINTS = 120_000;
// Default WebGL point sprite size in pixels.
const DEFAULT_POINT_SIZE = 2;
const CAMERA_FIT_PADDING = 1.35;
// Side length of the synthetic unit cube used when a cloud has no spread
// (e.g. a single point), so the camera has a non-zero target to frame.
const EMPTY_POINT_CLOUD_BOUNDS_SIZE = 1;
const MIN_POINT_SAMPLE_COUNT = 1;
const NORMALIZED_HEIGHT_MIN = 0;
const NORMALIZED_HEIGHT_MAX = 1;
const POINT_COMPONENT_COUNT = 3;
const COLOR_COMPONENT_COUNT = 3;
const X_COMPONENT_INDEX = 0;
const Y_COMPONENT_INDEX = 1;
const Z_COMPONENT_INDEX = 2;
// Height-to-colour mapping: points at the midpoint of the normalised height
// range blend between the cool (blue) and warm (red/green) colour anchors.
const HEIGHT_COLOR_MIDPOINT = 0.5;
// Scale factor applied to the normalised height before the colour ramp lookup.
const HEIGHT_COLOR_SCALE = 2;
const HEIGHT_COLOR_RED_BASE = 0.25;
const HEIGHT_COLOR_RED_RANGE = 0.75;
const HEIGHT_COLOR_GREEN_BASE = 0.55;
const HEIGHT_COLOR_GREEN_RANGE = 0.35;
const HEIGHT_COLOR_BLUE_BASE = NORMALIZED_HEIGHT_MAX;
const HEIGHT_COLOR_BLUE_WARM_RANGE = 0.48;
const HEIGHT_NORMALIZATION_EPSILON = 0.000001;
const HUD_BORDER_RADIUS_PX = 4;
const HUD_FONT_SIZE_PX = 11;
const HUD_LINE_HEIGHT = 1;
const HUD_OFFSET_PX = 8;
const STATUS_FONT_SIZE_PX = 13;
const STATUS_PADDING_PX = 16;
const CANONICAL_SCALAR_COLOR_FIELDS = [
  "intensity",
  "reflectivity",
  "reflectance",
  "rcs",
] as const;
const NEUTRAL_POINT_COLOR = [0.72, 0.76, 0.82] as const;
const DEFAULT_SCENE_CUBE_COLOR: RgbaColor = [0.1, 0.78, 0.95, 1];
const DEFAULT_SCENE_TEXT_COLOR: RgbaColor = [1, 1, 1, 1];
const SCENE_CUBE_WIREFRAME_OPACITY = 0.95;
const SCENE_SURFACE_OPACITY = 0.38;
const SCENE_TRIANGLE_OPACITY = 0.42;
const SCENE_LINE_OPACITY = 0.95;
const SCENE_MODEL_FALLBACK_SIZE = 1;
// Camera frustum wireframes: fixed apex-to-image-plane depth in meters.
// Purely presentational — the value is not data, which is also why
// frustums never participate in camera-fit bounds.
const CAMERA_FRUSTUM_DEPTH_M = 1;
const CAMERA_FRUSTUM_COLOR = 0xffaa33;
const CAMERA_FRUSTUM_OPACITY = 0.85;
const SCENE_TEXT_FONT_FAMILY = "Inter, system-ui, sans-serif";
const SCENE_TEXT_MIN_CANVAS_FONT_SIZE = 12;
const SCENE_TEXT_DEFAULT_WORLD_HEIGHT = 0.5;
const SCENE_TEXT_PADDING_PX = 4;
const sceneModelLoader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const sceneModelLoadCache = new Map<string, Promise<THREE.Object3D>>();
const sceneModelDataAssetCache = new WeakMap<
  Uint8Array,
  { readonly cacheKey: string; readonly url: string }
>();
let nextSceneModelDataAssetId = 0;
const MODEL_Y_UP_TO_SCENE_Z_UP_QUATERNION =
  new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(0, -1, 0),
    ),
  );
const MODEL_Y_UP_TO_SCENE_Z_UP_QUATERNION_COMPONENTS = [
  MODEL_Y_UP_TO_SCENE_Z_UP_QUATERNION.x,
  MODEL_Y_UP_TO_SCENE_Z_UP_QUATERNION.y,
  MODEL_Y_UP_TO_SCENE_Z_UP_QUATERNION.z,
  MODEL_Y_UP_TO_SCENE_Z_UP_QUATERNION.w,
] as [number, number, number, number];

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

interface PointCloudRenderData {
  readonly bounds: THREE.Box3;
  readonly colors: Float32Array;
  readonly finitePointCount: number;
  readonly positions: Float32Array;
  readonly renderedPointCount: number;
}

interface PointCloudRenderLayer {
  readonly data: PointCloudRenderData;
  readonly layer: PointCloudPanelLayer;
}

interface PointCloudObjectTransform {
  readonly position: [number, number, number];
  readonly quaternion: [number, number, number, number];
}

interface SceneAnnotationPrimitiveSummary {
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

interface SceneIndexedGeometryRenderData {
  readonly geometry: THREE.BufferGeometry;
  readonly usesVertexColors: boolean;
}

interface TextSpriteTexture {
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
  readonly warning?: string | null;
}

/**
 * Production point-cloud visualization panel backed by a stable Three.js
 * canvas. All layers share one scene and one camera, so multiple sensor
 * streams compose into a single fused view.
 */
export function PointCloudPanel({
  annotationLayers = [],
  cameraPose,
  className,
  colorBy,
  fit = "initial",
  frustumLayers = [],
  gridLayers = [],
  layers,
  maxRenderedPoints = DEFAULT_MAX_RENDERED_POINTS,
  onCameraPoseChange,
  onRenderStats,
  pointSize = DEFAULT_POINT_SIZE,
  showGizmo = true,
  showHud = true,
  style,
  warning = null,
}: PointCloudPanelProps) {
  const [canvasError, setCanvasError] = useState<string | null>(null);
  const [focusSceneRequestKey, setFocusSceneRequestKey] = useState(0);
  const renderLayers = useMemo(
    () =>
      layers.map((layer) => ({
        data: buildPointCloudRenderData(
          layer.frame.positions,
          maxRenderedPoints,
          {
            colorBy,
            colors: layer.frame.colors,
            scalarFields: layer.frame.scalarFields,
          },
        ),
        layer,
      })),
    [colorBy, layers, maxRenderedPoints],
  );

  const frameFitPose = useMemo(
    () =>
      cameraPoseForBounds(
        sceneBoundsForLayers(renderLayers, annotationLayers, gridLayers),
      ),
    [annotationLayers, gridLayers, renderLayers],
  );
  const [initialFitPose, setInitialFitPose] =
    useState<PointCloudCameraPose | null>(null);

  // This effect captures the first fitted camera pose for initial-fit mode and
  // clears it when the panel switches to another fit policy.
  useEffect(() => {
    if (fit !== "initial") {
      if (initialFitPose) setInitialFitPose(null);
      return;
    }
    if (!initialFitPose && frameFitPose) {
      setInitialFitPose(frameFitPose);
    }
  }, [fit, frameFitPose, initialFitPose]);

  const fittedCameraPose =
    fit === "never"
      ? null
      : fit === "frame"
        ? frameFitPose
        : (initialFitPose ?? frameFitPose);
  const effectiveCameraPose = cameraPose ?? fittedCameraPose;
  const cameraPoseSource = cameraPose
    ? "controlled"
    : fittedCameraPose
      ? "fitted"
      : "none";

  const finitePointCount = renderLayers.reduce(
    (sum, layer) => sum + layer.data.finitePointCount,
    0,
  );
  const declaredPointCount = layers.reduce(
    (sum, layer) => sum + layer.frame.pointCount,
    0,
  );
  const annotationEntityCount = annotationLayers.reduce(
    (sum, layer) => sum + layer.frame.entities.length,
    0,
  );
  const annotationPrimitiveSummary = useMemo(
    () => annotationPrimitiveSummaryForLayers(annotationLayers),
    [annotationLayers],
  );
  const annotationCubeCount = annotationPrimitiveSummary.cubeCount;
  const annotationPrimitiveCount = annotationPrimitiveSummary.totalCount;
  const hasPointCloudLayers = layers.length > 0;
  const hasSceneLayers =
    hasPointCloudLayers ||
    annotationLayers.length > 0 ||
    gridLayers.length > 0 ||
    frustumLayers.length > 0;
  const requestFocusScene = useCallback(() => {
    setFocusSceneRequestKey((current) => current + 1);
  }, []);
  useEffect(() => {
    if (!onRenderStats || !hasSceneLayers) return;

    const frame = requestAnimationFrame(() => {
      onRenderStats({
        annotationCubeCount,
        annotationEntityCount,
        annotationLayerCount: annotationLayers.length,
        annotationPrimitiveCount,
        ...(effectiveCameraPose ? { cameraPose: effectiveCameraPose } : {}),
        cameraPoseSource,
        declaredPointCount,
        finitePointCount,
        frustumLayerCount: frustumLayers.length,
        gridLayerCount: gridLayers.length,
        layerCount: layers.length,
        renderedPointCount: renderLayers.reduce(
          (sum, layer) => sum + layer.data.renderedPointCount,
          0,
        ),
      });
    });

    return () => cancelAnimationFrame(frame);
  }, [
    annotationCubeCount,
    annotationEntityCount,
    annotationLayers.length,
    annotationPrimitiveCount,
    declaredPointCount,
    effectiveCameraPose,
    finitePointCount,
    cameraPoseSource,
    frustumLayers.length,
    gridLayers.length,
    hasSceneLayers,
    layers.length,
    onRenderStats,
    renderLayers,
  ]);

  return (
    <div className={className} style={{ ...styles.panel, ...style }}>
      <WebGpuCanvas
        camera={PERSPECTIVE_POINT_CAMERA}
        onError={setCanvasError}
        role="img"
        style={styles.canvas}
      >
        <Base3DScene
          cameraPose={effectiveCameraPose}
          focusSceneRequestKey={focusSceneRequestKey || undefined}
          onCameraPoseChange={onCameraPoseChange}
          showGizmo={showGizmo}
        >
          {gridLayers.map((layer, index) => (
            <GridSceneLayer
              key={layer.id}
              layer={layer}
              renderOrder={index - gridLayers.length}
            />
          ))}
          {renderLayers.map(({ data, layer }) => (
            <PointCloudSceneLayer
              key={layer.id}
              data={data}
              layer={layer}
              pointSize={pointSize}
            />
          ))}
          {annotationLayers.map((layer) => (
            <SceneAnnotationLayer key={layer.id} layer={layer} />
          ))}
          {frustumLayers.map((layer) => (
            <CameraFrustumSceneLayer key={layer.id} layer={layer} />
          ))}
        </Base3DScene>
      </WebGpuCanvas>

      {canvasError ? (
        <div style={styles.status}>{canvasError}</div>
      ) : hasPointCloudLayers &&
        finitePointCount === 0 &&
        annotationPrimitiveCount === 0 ? (
        <div style={styles.status}>No finite points</div>
      ) : null}
      {!canvasError ? (
        <div style={styles.focusControls}>
          <button
            aria-label="Focus camera on visible 3D data"
            onClick={requestFocusScene}
            style={styles.focusButton}
            title="Focus camera on visible 3D data"
            type="button"
          >
            <Icon
              name={IconName.Move}
              size={Size.Xs}
              style={styles.focusButtonIcon}
            />
          </button>
        </div>
      ) : null}
      {!canvasError && showHud && hasSceneLayers ? (
        <div style={styles.hud}>
          {hasPointCloudLayers
            ? pointCountLabel(finitePointCount, declaredPointCount)
            : annotationLayers.length > 0
              ? annotationCountLabel(annotationPrimitiveSummary)
              : gridLayers.length > 0
                ? gridCountLabel(gridLayers.length)
                : frustumCountLabel(frustumLayers.length)}
        </div>
      ) : null}
      {warning ? <div style={styles.warning}>{warning}</div> : null}
    </div>
  );
}

function SceneAnnotationLayer({
  layer,
}: {
  readonly layer: SceneAnnotationPanelLayer;
}) {
  const invalidate = useThree((state) => state.invalidate);
  const { frameTransform } = layer;
  const objectTransform = useMemo(
    () => pointCloudObjectTransform(frameTransform),
    [frameTransform],
  );

  useEffect(() => {
    invalidate();
  }, [invalidate, objectTransform]);

  return (
    <group
      position={objectTransform.position}
      quaternion={objectTransform.quaternion}
    >
      {layer.frame.entities.map((entity, entityIndex) => (
        <group key={entity.id || entityIndex}>
          {entity.arrows.map((arrow, primitiveIndex) => (
            <SceneArrowMesh
              arrow={arrow}
              key={scenePrimitiveKey(
                entity.id,
                entityIndex,
                "arrow",
                primitiveIndex,
              )}
            />
          ))}
          {entity.cubes.map((cube, primitiveIndex) => (
            <SceneCubeMesh
              cube={cube}
              key={scenePrimitiveKey(
                entity.id,
                entityIndex,
                "cube",
                primitiveIndex,
              )}
            />
          ))}
          {entity.cylinders.map((cylinder, primitiveIndex) => (
            <SceneCylinderMesh
              cylinder={cylinder}
              key={scenePrimitiveKey(
                entity.id,
                entityIndex,
                "cylinder",
                primitiveIndex,
              )}
            />
          ))}
          {entity.lines.map((line, primitiveIndex) => (
            <SceneLineMesh
              key={scenePrimitiveKey(
                entity.id,
                entityIndex,
                "line",
                primitiveIndex,
              )}
              line={line}
            />
          ))}
          {entity.models.map((model, primitiveIndex) => (
            <SceneModelMesh
              key={scenePrimitiveKey(
                entity.id,
                entityIndex,
                "model",
                primitiveIndex,
              )}
              model={model}
            />
          ))}
          {entity.spheres.map((sphere, primitiveIndex) => (
            <SceneSphereMesh
              key={scenePrimitiveKey(
                entity.id,
                entityIndex,
                "sphere",
                primitiveIndex,
              )}
              sphere={sphere}
            />
          ))}
          {entity.texts.map((text, primitiveIndex) => (
            <SceneTextSprite
              key={scenePrimitiveKey(
                entity.id,
                entityIndex,
                "text",
                primitiveIndex,
              )}
              textPrimitive={text}
            />
          ))}
          {entity.triangles.map((triangle, primitiveIndex) => (
            <SceneTriangleMesh
              key={scenePrimitiveKey(
                entity.id,
                entityIndex,
                "triangle",
                primitiveIndex,
              )}
              triangle={triangle}
            />
          ))}
        </group>
      ))}
    </group>
  );
}

function GridSceneLayer({
  layer,
  renderOrder,
}: {
  readonly layer: GridPanelLayer;
  readonly renderOrder: number;
}) {
  const invalidate = useThree((state) => state.invalidate);
  const { frame, frameTransform } = layer;
  const objectTransform = useMemo(
    () => pointCloudObjectTransform(frameTransform),
    [frameTransform],
  );
  const poseTransform = useMemo(
    () => scenePoseObjectTransform(frame.pose),
    [frame.pose],
  );
  // The texture is keyed on message identity (layer id + content time), not
  // on the frame object: playback re-delivers the same grid message in new
  // wrapper objects every batch, and re-uploading a multi-megabyte map
  // texture per batch would stall the scene. `frame` is therefore
  // deliberately omitted from the deps (the lint disable below); it only
  // participates as the fallback key when a layer carries no content time.
  const texture = useMemo(
    () => createGridTexture(frame),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [layer.id, layer.contentTimeNs ?? frame],
  );

  useEffect(() => () => texture.dispose(), [texture]);
  useEffect(() => {
    invalidate();
  }, [invalidate, objectTransform, poseTransform, renderOrder, texture]);

  const width = frame.columnCount * frame.cellSize[0];
  const height = frame.rowCount * frame.cellSize[1];
  if (!isFinitePositiveNumber(width) || !isFinitePositiveNumber(height)) {
    return null;
  }

  // Cast, not a type: @react-three/fiber's bundled three types disagree with
  // the app's pinned three version (its `Texture` requires `isTextureArray`,
  // which our DataTexture predates), so a structurally-valid texture fails
  // the material prop check. Runtime is unaffected; drop this cast when the
  // two three versions are aligned. Same workaround as SceneTextSprite.
  const textureMap = texture as never;

  return (
    <group
      position={objectTransform.position}
      quaternion={objectTransform.quaternion}
    >
      <group
        position={poseTransform.position}
        quaternion={poseTransform.quaternion}
      >
        {/* The grid pose anchors the plane's origin corner (+x columns,
            +y rows); PlaneGeometry is centered, hence the half-size offset.
            depthWrite stays off so coplanar map layers composite by
            renderOrder instead of z-fighting. */}
        <mesh position={[width / 2, height / 2, 0]} renderOrder={renderOrder}>
          <planeGeometry args={[width, height]} />
          <meshBasicMaterial
            depthWrite={false}
            map={textureMap}
            side={THREE.DoubleSide}
            transparent
          />
        </mesh>
      </group>
    </group>
  );
}

function createGridTexture(frame: GridVisualization): THREE.DataTexture {
  const texture = new THREE.DataTexture(
    frame.rgba,
    frame.columnCount,
    frame.rowCount,
    THREE.RGBAFormat,
  );
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;

  return texture;
}

function CameraFrustumSceneLayer({
  layer,
}: {
  readonly layer: CameraFrustumPanelLayer;
}) {
  const invalidate = useThree((state) => state.invalidate);
  const { frame, frameTransform, image } = layer;
  const objectTransform = useMemo(
    () => pointCloudObjectTransform(frameTransform),
    [frameTransform],
  );
  // Geometries are keyed on message identity (layer id + content time), not
  // on the frame object: playback re-delivers the same calibration message
  // in new wrapper objects every batch (see GridSceneLayer's texture memo),
  // so `frame` is deliberately omitted from the deps (the lint disables
  // below).
  const geometry = useMemo(
    () => createCameraFrustumGeometry(frame),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [layer.id, layer.contentTimeNs ?? frame],
  );
  const imagePlaneGeometry = useMemo(
    () => createCameraImagePlaneGeometry(frame),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [layer.id, layer.contentTimeNs ?? frame],
  );
  const [imageHandle, setImageHandle] = useState<ImageTextureHandle | null>(
    null,
  );
  const imageHandleRef = useRef<ImageTextureHandle | null>(null);
  const replaceImageHandle = useCallback((next: ImageTextureHandle | null) => {
    const previous = imageHandleRef.current;
    if (previous && previous !== next) {
      previous.dispose();
    }
    imageHandleRef.current = next;
    setImageHandle(next);
  }, []);

  // This effect decodes the camera's current encoded frame into the image
  // plane texture. It is keyed on message identity (layer id + image
  // content time) for the same batch-redelivery reason as the geometries,
  // so `image` is deliberately omitted from the deps.
  useEffect(() => {
    if (!image || image.bytes.byteLength === 0) {
      replaceImageHandle(null);
      return undefined;
    }

    let cancelled = false;
    createImageTexture(image.bytes, image.mimeType)
      .then((handle) => {
        if (cancelled) {
          handle.dispose();
          return;
        }
        replaceImageHandle(handle);
        invalidate();
      })
      .catch(() => {
        if (!cancelled) {
          replaceImageHandle(null);
        }
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invalidate, layer.id, layer.imageContentTimeNs ?? image]);

  useEffect(
    () => () => {
      imageHandleRef.current?.dispose();
      imageHandleRef.current = null;
    },
    [],
  );
  useEffect(() => () => geometry?.dispose(), [geometry]);
  useEffect(() => () => imagePlaneGeometry?.dispose(), [imagePlaneGeometry]);
  useEffect(() => {
    invalidate();
  }, [geometry, imageHandle, imagePlaneGeometry, invalidate, objectTransform]);

  if (!geometry) {
    return null;
  }

  // Cast, not a type: fiber's bundled three `Texture` type is out of sync
  // with the app's pinned three version — see GridSceneLayer's textureMap.
  const imageMap = imageHandle ? (imageHandle.texture as never) : null;

  return (
    <group
      position={objectTransform.position}
      quaternion={objectTransform.quaternion}
    >
      <lineSegments frustumCulled={false}>
        <primitive attach="geometry" object={geometry} />
        <lineBasicMaterial
          color={CAMERA_FRUSTUM_COLOR}
          opacity={CAMERA_FRUSTUM_OPACITY}
          transparent
        />
      </lineSegments>
      {imageMap && imagePlaneGeometry ? (
        <mesh frustumCulled={false}>
          <primitive attach="geometry" object={imagePlaneGeometry} />
          <meshBasicMaterial map={imageMap} side={THREE.DoubleSide} />
        </mesh>
      ) : null}
    </group>
  );
}

/**
 * Image-corner directions for one camera in the OpenCV/Foxglove camera
 * convention (+Z forward, +X right, +Y down), at the fixed frustum depth.
 * Corners come straight from the intrinsic matrix so off-center principal
 * points render truthfully: corner = ((u - cx) / fx * d, (v - cy) / fy * d, d).
 * Order: top-left, top-right, bottom-right, bottom-left in image pixels.
 */
function cameraFrustumCorners(
  frame: CameraCalibrationVisualization,
): readonly (readonly [number, number, number])[] | null {
  const fx = frame.K[0];
  const fy = frame.K[4];
  const cx = frame.K[2];
  const cy = frame.K[5];
  if (
    !isFinitePositiveNumber(fx) ||
    !isFinitePositiveNumber(fy) ||
    !Number.isFinite(cx) ||
    !Number.isFinite(cy) ||
    !isFinitePositiveNumber(frame.width) ||
    !isFinitePositiveNumber(frame.height)
  ) {
    return null;
  }

  const depth = CAMERA_FRUSTUM_DEPTH_M;
  const cornerPixels: readonly (readonly [number, number])[] = [
    [0, 0],
    [frame.width, 0],
    [frame.width, frame.height],
    [0, frame.height],
  ];

  return cornerPixels.map(
    ([u, v]) =>
      [((u - cx) / fx) * depth, ((v - cy) / fy) * depth, depth] as const,
  );
}

/**
 * Wireframe frustum for one camera: four rays from the optical center to
 * the image corners plus the far rectangle.
 */
function createCameraFrustumGeometry(
  frame: CameraCalibrationVisualization,
): THREE.BufferGeometry | null {
  const corners = cameraFrustumCorners(frame);
  if (!corners) {
    return null;
  }

  const segments: number[] = [];
  for (const corner of corners) {
    segments.push(0, 0, 0, ...corner);
  }
  for (let index = 0; index < corners.length; index++) {
    const next = corners[(index + 1) % corners.length];
    segments.push(...corners[index], ...next);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(Float32Array.from(segments), 3),
  );

  return geometry;
}

/**
 * Quad filling the frustum's far rectangle, UV-mapped so the camera's
 * image renders upright: image pixel row 0 (top) sits on the frustum's
 * top edge, matching the default `flipY` texture orientation.
 */
function createCameraImagePlaneGeometry(
  frame: CameraCalibrationVisualization,
): THREE.BufferGeometry | null {
  const corners = cameraFrustumCorners(frame);
  if (!corners) {
    return null;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(Float32Array.from(corners.flat()), 3),
  );
  geometry.setAttribute(
    "uv",
    // Corner order TL, TR, BR, BL; flipY textures put image-top at v=1.
    new THREE.BufferAttribute(Float32Array.from([0, 1, 1, 1, 1, 0, 0, 0]), 2),
  );
  geometry.setIndex([0, 1, 2, 0, 2, 3]);

  return geometry;
}

function scenePrimitiveKey(
  entityId: string,
  entityIndex: number,
  family: string,
  primitiveIndex: number,
) {
  return `${entityId || entityIndex}:${family}:${primitiveIndex}`;
}

function SceneArrowMesh({ arrow }: { readonly arrow: SceneArrowPrimitive }) {
  const shaftRadius = arrow.shaftDiameter / 2;
  const headRadius = arrow.headDiameter / 2;
  const hasShaft =
    Number.isFinite(arrow.shaftLength) &&
    arrow.shaftLength > 0 &&
    Number.isFinite(shaftRadius) &&
    shaftRadius > 0;
  const hasHead =
    Number.isFinite(arrow.headLength) &&
    arrow.headLength > 0 &&
    Number.isFinite(headRadius) &&
    headRadius > 0;

  if (!hasShaft && !hasHead) {
    return null;
  }

  const transform = scenePoseObjectTransform(arrow.pose);
  const material = sceneMaterialProps(arrow.color, SCENE_SURFACE_OPACITY);

  return (
    <group position={transform.position} quaternion={transform.quaternion}>
      {hasShaft ? (
        <mesh
          frustumCulled={false}
          position={[arrow.shaftLength / 2, 0, 0]}
          rotation={[0, 0, -Math.PI / 2]}
        >
          <cylinderGeometry
            args={[shaftRadius, shaftRadius, arrow.shaftLength, 16]}
          />
          <meshBasicMaterial {...material} />
        </mesh>
      ) : null}
      {hasHead ? (
        <mesh
          frustumCulled={false}
          position={[
            Math.max(0, arrow.shaftLength) + arrow.headLength / 2,
            0,
            0,
          ]}
          rotation={[0, 0, -Math.PI / 2]}
        >
          <coneGeometry args={[headRadius, arrow.headLength, 16]} />
          <meshBasicMaterial {...material} />
        </mesh>
      ) : null}
    </group>
  );
}

function SceneCubeMesh({ cube }: { readonly cube: SceneCubePrimitive }) {
  const size = cube.size;
  if (!isFinitePositiveVector(size)) {
    return null;
  }

  const transform = scenePoseObjectTransform(cube.pose);
  const material = sceneMaterialProps(cube.color, SCENE_CUBE_WIREFRAME_OPACITY);

  return (
    <group position={transform.position} quaternion={transform.quaternion}>
      <mesh frustumCulled={false}>
        <boxGeometry args={[size[0], size[1], size[2]]} />
        <meshBasicMaterial {...material} wireframe />
      </mesh>
    </group>
  );
}

function SceneCylinderMesh({
  cylinder,
}: {
  readonly cylinder: SceneCylinderPrimitive;
}) {
  if (
    !isFinitePositiveVector(cylinder.size) ||
    (!isFinitePositiveNumber(cylinder.bottomScale) &&
      !isFinitePositiveNumber(cylinder.topScale))
  ) {
    return null;
  }

  const transform = scenePoseObjectTransform(cylinder.pose);
  const material = sceneMaterialProps(cylinder.color, SCENE_SURFACE_OPACITY);

  return (
    <group position={transform.position} quaternion={transform.quaternion}>
      <mesh
        frustumCulled={false}
        rotation={[Math.PI / 2, 0, 0]}
        scale={[cylinder.size[0], cylinder.size[2], cylinder.size[1]]}
      >
        <cylinderGeometry
          args={[
            Math.max(0, cylinder.topScale) / 2,
            Math.max(0, cylinder.bottomScale) / 2,
            1,
            24,
          ]}
        />
        <meshBasicMaterial {...material} wireframe />
      </mesh>
    </group>
  );
}

function SceneLineMesh({ line }: { readonly line: SceneLinePrimitive }) {
  const invalidate = useThree((state) => state.invalidate);
  const renderData = useMemo(() => createSceneLineRenderData(line), [line]);

  useEffect(() => {
    if (!renderData) return;
    invalidate();
    return () => renderData.geometry.dispose();
  }, [invalidate, renderData]);

  if (!renderData) {
    return null;
  }

  const transform = scenePoseObjectTransform(line.pose);
  const material = sceneMaterialProps(line.color, SCENE_LINE_OPACITY);

  return (
    <group position={transform.position} quaternion={transform.quaternion}>
      <lineSegments frustumCulled={false}>
        <primitive attach="geometry" object={renderData.geometry} />
        <lineBasicMaterial
          {...material}
          linewidth={Math.max(1, line.thickness || 1)}
          vertexColors={renderData.usesVertexColors}
        />
      </lineSegments>
    </group>
  );
}

function SceneModelMesh({ model }: { readonly model: SceneModelPrimitive }) {
  const invalidate = useThree((state) => state.invalidate);
  const [object, setObject] = useState<THREE.Object3D | null>(null);
  const loadedInstanceKeyRef = useRef<string | null>(null);
  const modelData = model.data;
  const modelMediaType = model.mediaType;
  const modelUrl = model.url;
  const modelColorKey =
    model.overrideColor && model.color ? rgbaColorKey(model.color) : "";
  const asset = useMemo(
    () =>
      modelAssetForPrimitive({
        data: modelData,
        mediaType: modelMediaType,
        url: modelUrl,
      }),
    [modelData, modelMediaType, modelUrl],
  );
  const instanceKey = asset
    ? `${asset.cacheKey}|${model.overrideColor ? modelColorKey : "source"}`
    : null;

  useEffect(() => {
    let isActive = true;

    if (!asset || !instanceKey) {
      loadedInstanceKeyRef.current = null;
      setObject(null);
      return;
    }

    if (loadedInstanceKeyRef.current === instanceKey) {
      return;
    }

    loadSceneModelAsset(asset)
      .then((baseObject) => {
        if (!isActive) {
          return;
        }
        const scene = cloneObject3D(baseObject);
        if (model.overrideColor && model.color) {
          applyModelOverrideColor(scene, model.color);
        }
        loadedInstanceKeyRef.current = instanceKey;
        setObject(scene);
        invalidate();
      })
      .catch(() => {
        if (isActive && loadedInstanceKeyRef.current !== instanceKey) {
          setObject(null);
        }
      });

    return () => {
      isActive = false;
    };
  }, [asset, instanceKey, invalidate, model.color, model.overrideColor]);

  useEffect(() => {
    return () => {
      if (object) {
        disposeObject3D(object);
      }
    };
  }, [object]);

  if (!object || !isFinitePositiveVector(model.scale)) {
    return null;
  }

  const transform = scenePoseObjectTransform(model.pose);

  return (
    <group
      position={transform.position}
      quaternion={transform.quaternion}
      scale={model.scale}
    >
      <group quaternion={MODEL_Y_UP_TO_SCENE_Z_UP_QUATERNION_COMPONENTS}>
        <primitive object={object} />
      </group>
    </group>
  );
}

function SceneSphereMesh({
  sphere,
}: {
  readonly sphere: SceneSpherePrimitive;
}) {
  if (!isFinitePositiveVector(sphere.size)) {
    return null;
  }

  const transform = scenePoseObjectTransform(sphere.pose);
  const material = sceneMaterialProps(sphere.color, SCENE_SURFACE_OPACITY);

  return (
    <group position={transform.position} quaternion={transform.quaternion}>
      <mesh frustumCulled={false} scale={sphere.size}>
        <sphereGeometry args={[0.5, 18, 12]} />
        <meshBasicMaterial {...material} wireframe />
      </mesh>
    </group>
  );
}

function SceneTextSprite({
  textPrimitive,
}: {
  readonly textPrimitive: SceneTextPrimitive;
}) {
  const invalidate = useThree((state) => state.invalidate);
  const spriteTexture = useMemo(
    () => createTextSpriteTexture(textPrimitive),
    [textPrimitive],
  );

  useEffect(() => {
    if (!spriteTexture) return;
    invalidate();
    return () => spriteTexture.texture.dispose();
  }, [invalidate, spriteTexture]);

  if (!spriteTexture) {
    return null;
  }

  const transform = scenePoseObjectTransform(textPrimitive.pose);
  const [, , , alpha] = textPrimitive.color ?? DEFAULT_SCENE_TEXT_COLOR;
  // Cast, not a type: fiber's bundled three `Texture` type is out of sync
  // with the app's pinned three version — see GridSceneLayer's textureMap.
  const textureMap = spriteTexture.texture as never;
  const displayHeight = textPrimitive.scaleInvariant
    ? Math.max(SCENE_TEXT_MIN_CANVAS_FONT_SIZE, textPrimitive.fontSize || 0)
    : Math.max(
        SCENE_TEXT_DEFAULT_WORLD_HEIGHT,
        textPrimitive.fontSize || SCENE_TEXT_DEFAULT_WORLD_HEIGHT,
      );

  if (!textPrimitive.billboard) {
    return (
      <group position={transform.position} quaternion={transform.quaternion}>
        <mesh
          frustumCulled={false}
          scale={[displayHeight * spriteTexture.aspectRatio, displayHeight, 1]}
        >
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial
            map={textureMap}
            opacity={clamp01(alpha)}
            side={THREE.DoubleSide}
            transparent
          />
        </mesh>
      </group>
    );
  }

  return (
    <group position={transform.position} quaternion={transform.quaternion}>
      <sprite
        frustumCulled={false}
        scale={[displayHeight * spriteTexture.aspectRatio, displayHeight, 1]}
      >
        <spriteMaterial
          map={textureMap}
          opacity={clamp01(alpha)}
          sizeAttenuation={!textPrimitive.scaleInvariant}
          transparent
        />
      </sprite>
    </group>
  );
}

function createSceneLineRenderData(
  line: SceneLinePrimitive,
): SceneIndexedGeometryRenderData | null {
  const orderedPointIndices = primitivePointIndices(line.points, line.indices);
  const segmentPairs = lineSegmentPairs(orderedPointIndices, line.type);
  if (segmentPairs.length === 0) {
    return null;
  }

  const positions: number[] = [];
  const colors: number[] = [];
  const usesVertexColors = line.colors.length >= line.points.length;

  for (const [startIndex, endIndex] of segmentPairs) {
    const start = line.points[startIndex];
    const end = line.points[endIndex];
    if (!isFinitePoint3(start) || !isFinitePoint3(end)) {
      continue;
    }

    positions.push(...start, ...end);
    if (usesVertexColors) {
      colors.push(...rgbComponents(line.colors[startIndex]));
      colors.push(...rgbComponents(line.colors[endIndex]));
    }
  }

  if (positions.length === 0) {
    return null;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(
      new Float32Array(positions),
      POINT_COMPONENT_COUNT,
    ),
  );
  if (usesVertexColors) {
    geometry.setAttribute(
      "color",
      new THREE.BufferAttribute(
        new Float32Array(colors),
        COLOR_COMPONENT_COUNT,
      ),
    );
  }
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  return { geometry, usesVertexColors };
}

function createSceneTriangleRenderData(
  triangle: SceneTrianglePrimitive,
): SceneIndexedGeometryRenderData | null {
  const orderedPointIndices = primitivePointIndices(
    triangle.points,
    triangle.indices,
  );
  const trianglePointCount = Math.floor(orderedPointIndices.length / 3) * 3;
  if (trianglePointCount === 0) {
    return null;
  }

  const positions: number[] = [];
  const colors: number[] = [];
  const usesVertexColors = triangle.colors.length >= triangle.points.length;

  for (let index = 0; index < trianglePointCount; index++) {
    const pointIndex = orderedPointIndices[index];
    const point = triangle.points[pointIndex];
    if (!isFinitePoint3(point)) {
      continue;
    }
    positions.push(...point);
    if (usesVertexColors) {
      colors.push(...rgbComponents(triangle.colors[pointIndex]));
    }
  }

  if (positions.length === 0 || positions.length % 9 !== 0) {
    return null;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(
      new Float32Array(positions),
      POINT_COMPONENT_COUNT,
    ),
  );
  if (usesVertexColors) {
    geometry.setAttribute(
      "color",
      new THREE.BufferAttribute(
        new Float32Array(colors),
        COLOR_COMPONENT_COUNT,
      ),
    );
  }
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  return { geometry, usesVertexColors };
}

function createTextSpriteTexture(
  textPrimitive: SceneTextPrimitive,
): TextSpriteTexture | null {
  if (!textPrimitive.text || typeof document === "undefined") {
    return null;
  }

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) {
    return null;
  }

  const fontSize = Math.max(
    SCENE_TEXT_MIN_CANVAS_FONT_SIZE,
    textPrimitive.fontSize || SCENE_TEXT_MIN_CANVAS_FONT_SIZE,
  );
  const font = `${fontSize}px ${SCENE_TEXT_FONT_FAMILY}`;
  context.font = font;
  const metrics = context.measureText(textPrimitive.text);
  const width = Math.max(
    1,
    Math.ceil(metrics.width + SCENE_TEXT_PADDING_PX * 2),
  );
  const height = Math.max(
    1,
    Math.ceil(fontSize * 1.35 + SCENE_TEXT_PADDING_PX * 2),
  );
  canvas.width = width;
  canvas.height = height;

  context.font = font;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = rgbaCss(textPrimitive.color ?? DEFAULT_SCENE_TEXT_COLOR);
  context.fillText(textPrimitive.text, width / 2, height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;

  return {
    aspectRatio: width / height,
    texture: texture as unknown as THREE.Texture,
  };
}

function modelAssetForPrimitive(model: {
  readonly data?: Uint8Array;
  readonly mediaType: string;
  readonly url: string;
}): { readonly cacheKey: string; readonly url: string } | null {
  if (model.url) {
    return { cacheKey: `url:${model.url}`, url: model.url };
  }
  if (!model.data?.byteLength || typeof URL === "undefined") {
    return null;
  }

  const cachedAsset = sceneModelDataAssetCache.get(model.data);
  if (cachedAsset) {
    return cachedAsset;
  }

  const cacheKey = `data:${nextSceneModelDataAssetId++}`;
  const blob = new Blob([model.data], {
    type: model.mediaType || "model/gltf-binary",
  });
  const url = URL.createObjectURL(blob);
  const asset = { cacheKey, url };
  sceneModelDataAssetCache.set(model.data, asset);

  return asset;
}

function loadSceneModelAsset(asset: {
  readonly cacheKey: string;
  readonly url: string;
}) {
  const cached = sceneModelLoadCache.get(asset.cacheKey);
  if (cached) {
    return cached;
  }

  const loadPromise = new Promise<THREE.Object3D>((resolve, reject) => {
    sceneModelLoader.load(
      asset.url,
      (gltf) => resolve(gltf.scene),
      undefined,
      reject,
    );
  }).catch((error) => {
    sceneModelLoadCache.delete(asset.cacheKey);
    throw error;
  });
  sceneModelLoadCache.set(asset.cacheKey, loadPromise);

  return loadPromise;
}

function cloneObject3D(object: THREE.Object3D) {
  const clone = object.clone(true);
  clone.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) {
      return;
    }
    mesh.geometry = mesh.geometry?.clone();
    if (Array.isArray(mesh.material)) {
      mesh.material = mesh.material.map((material) => material.clone());
    } else if (mesh.material) {
      mesh.material = mesh.material.clone();
    }
  });

  return clone;
}

function applyModelOverrideColor(object: THREE.Object3D, color: RgbaColor) {
  const [r, g, b, a] = color;
  const threeColor = new THREE.Color(clamp01(r), clamp01(g), clamp01(b));
  const opacity = clamp01(a);

  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) {
      return;
    }

    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];
    const clonedMaterials = materials.map((material) => {
      const clone = material.clone();
      if ("color" in clone && clone.color instanceof THREE.Color) {
        clone.color.copy(threeColor);
      }
      clone.opacity = opacity;
      clone.transparent = opacity < 1 || clone.transparent;
      return clone;
    });
    mesh.material = Array.isArray(mesh.material)
      ? clonedMaterials
      : clonedMaterials[0];
  });
}

function disposeObject3D(object: THREE.Object3D) {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) {
      return;
    }
    mesh.geometry?.dispose();
    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];
    materials.forEach((material) => material.dispose());
  });
}

function SceneTriangleMesh({
  triangle,
}: {
  readonly triangle: SceneTrianglePrimitive;
}) {
  const invalidate = useThree((state) => state.invalidate);
  const renderData = useMemo(
    () => createSceneTriangleRenderData(triangle),
    [triangle],
  );

  useEffect(() => {
    if (!renderData) return;
    invalidate();
    return () => renderData.geometry.dispose();
  }, [invalidate, renderData]);

  if (!renderData) {
    return null;
  }

  const transform = scenePoseObjectTransform(triangle.pose);
  const material = sceneMaterialProps(triangle.color, SCENE_TRIANGLE_OPACITY);

  return (
    <group position={transform.position} quaternion={transform.quaternion}>
      <mesh frustumCulled={false}>
        <primitive attach="geometry" object={renderData.geometry} />
        <meshBasicMaterial
          {...material}
          side={THREE.DoubleSide}
          vertexColors={renderData.usesVertexColors}
        />
      </mesh>
    </group>
  );
}

function PointCloudSceneLayer({
  data,
  layer,
  pointSize,
}: {
  readonly data: PointCloudRenderData;
  readonly layer: PointCloudPanelLayer;
  readonly pointSize: number;
}) {
  const invalidate = useThree((state) => state.invalidate);
  const { frameTransform } = layer;
  const objectTransform = useMemo(
    () => pointCloudObjectTransform(frameTransform),
    [frameTransform],
  );

  // This effect requests a frameloop-on-demand repaint when the layer's
  // placement changes.
  useEffect(() => {
    invalidate();
  }, [invalidate, objectTransform]);

  return (
    <group
      position={objectTransform.position}
      quaternion={objectTransform.quaternion}
    >
      <PointCloudPoints data={data} pointSize={pointSize} />
    </group>
  );
}

function PointCloudPoints({
  data,
  pointSize,
}: {
  readonly data: PointCloudRenderData;
  readonly pointSize: number;
}) {
  const invalidate = useThree((state) => state.invalidate);
  const geometry = useMemo(() => createPointCloudGeometry(data), [data]);

  // This effect requests a repaint when point geometry changes and disposes the
  // old GPU geometry on cleanup.
  useEffect(() => {
    invalidate();
    return () => geometry.dispose();
  }, [geometry, invalidate]);

  return (
    <points frustumCulled={false}>
      <primitive attach="geometry" object={geometry} />
      <pointsMaterial size={pointSize} sizeAttenuation={false} vertexColors />
    </points>
  );
}

function createPointCloudGeometry(data: PointCloudRenderData) {
  const geometry = new THREE.BufferGeometry();
  const positionAttribute = new THREE.BufferAttribute(
    data.positions,
    POINT_COMPONENT_COUNT,
  );
  const colorAttribute = new THREE.BufferAttribute(
    data.colors,
    POINT_COMPONENT_COUNT,
  );
  positionAttribute.setUsage(THREE.DynamicDrawUsage);
  colorAttribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("position", positionAttribute);
  geometry.setAttribute("color", colorAttribute);
  geometry.setDrawRange(0, data.renderedPointCount);
  geometry.boundingBox = data.bounds.clone();
  geometry.boundingSphere = data.bounds.getBoundingSphere(new THREE.Sphere());

  return geometry;
}

function buildPointCloudRenderData(
  sourcePositions: Float32Array,
  maxRenderedPoints: number,
  colorOptions: {
    readonly colorBy?: PointCloudColorBy;
    readonly colors?: Float32Array;
    readonly scalarFields?: readonly PointCloudScalarField[];
  },
): PointCloudRenderData {
  const sourcePointCount = Math.floor(
    sourcePositions.length / POINT_COMPONENT_COUNT,
  );
  const sampleEvery = Math.max(
    MIN_POINT_SAMPLE_COUNT,
    Math.ceil(
      sourcePointCount / Math.max(MIN_POINT_SAMPLE_COUNT, maxRenderedPoints),
    ),
  );
  const maxSampleCount = Math.max(
    MIN_POINT_SAMPLE_COUNT,
    Math.ceil(sourcePointCount / sampleEvery),
  );
  const positions = new Float32Array(maxSampleCount * POINT_COMPONENT_COUNT);
  const colors = new Float32Array(maxSampleCount * COLOR_COMPONENT_COUNT);
  const heightBounds = computeSourceHeightBounds(sourcePositions);
  const colorSource = resolvePointCloudColorSource({
    ...colorOptions,
    heightBounds,
    sourcePointCount,
    sourcePositions,
  });
  const bounds = new THREE.Box3();
  // Bounds are updated per rendered point; reuse one vector to avoid a large
  // allocation burst on dense point clouds.
  const tmpVec = new THREE.Vector3();
  let renderedPointCount = 0;

  bounds.makeEmpty();

  for (
    let sourcePointIndex = 0;
    sourcePointIndex < sourcePointCount;
    sourcePointIndex += sampleEvery
  ) {
    const sourceOffset = sourcePointIndex * POINT_COMPONENT_COUNT;
    const x = sourcePositions[sourceOffset];
    const y = sourcePositions[sourceOffset + Y_COMPONENT_INDEX];
    const z = sourcePositions[sourceOffset + Z_COMPONENT_INDEX];

    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      continue;
    }

    const targetOffset = renderedPointCount * POINT_COMPONENT_COUNT;
    positions[targetOffset + X_COMPONENT_INDEX] = x;
    positions[targetOffset + Y_COMPONENT_INDEX] = y;
    positions[targetOffset + Z_COMPONENT_INDEX] = z;
    writePointColor(colors, targetOffset, colorSource, sourcePointIndex, z);
    tmpVec.set(
      positions[targetOffset + X_COMPONENT_INDEX],
      positions[targetOffset + Y_COMPONENT_INDEX],
      positions[targetOffset + Z_COMPONENT_INDEX],
    );
    bounds.expandByPoint(tmpVec);
    renderedPointCount++;
  }

  // Sampling can miss all finite source points, so the drawn count is the
  // authoritative signal for whether Three.js needs fallback bounds.
  if (renderedPointCount === 0) {
    bounds.setFromCenterAndSize(
      new THREE.Vector3(),
      new THREE.Vector3(
        EMPTY_POINT_CLOUD_BOUNDS_SIZE,
        EMPTY_POINT_CLOUD_BOUNDS_SIZE,
        EMPTY_POINT_CLOUD_BOUNDS_SIZE,
      ),
    );
  }

  return {
    bounds,
    colors,
    finitePointCount: heightBounds.finitePointCount,
    positions,
    renderedPointCount,
  };
}

type PointCloudColorSource =
  | {
      readonly kind: "height";
      readonly maxValue: number;
      readonly minValue: number;
    }
  | {
      readonly colors: Float32Array;
      readonly kind: "rgb";
    }
  | {
      readonly kind: "scalar";
      readonly maxValue: number;
      readonly minValue: number;
      readonly values: Float32Array;
    }
  | {
      readonly kind: "uniform";
    };

function resolvePointCloudColorSource({
  colorBy,
  colors,
  heightBounds,
  scalarFields,
  sourcePointCount,
  sourcePositions,
}: {
  readonly colorBy?: PointCloudColorBy;
  readonly colors?: Float32Array;
  readonly heightBounds: ReturnType<typeof computeSourceHeightBounds>;
  readonly scalarFields?: readonly PointCloudScalarField[];
  readonly sourcePointCount: number;
  readonly sourcePositions: Float32Array;
}): PointCloudColorSource {
  if (colorBy && colorBy !== "auto") {
    return (
      requestedColorSource({
        colorBy,
        colors,
        heightBounds,
        scalarFields,
        sourcePointCount,
        sourcePositions,
      }) ?? { kind: "uniform" }
    );
  }

  const rgbSource = rgbColorSource(colors, sourcePointCount);
  if (rgbSource) {
    return rgbSource;
  }

  for (const fieldName of CANONICAL_SCALAR_COLOR_FIELDS) {
    const scalarSource = scalarColorSource(
      sourcePositions,
      sourcePointCount,
      scalarFields,
      fieldName,
    );
    if (scalarSource) {
      return scalarSource;
    }
  }

  return heightColorSource(heightBounds) ?? { kind: "uniform" };
}

function requestedColorSource({
  colorBy,
  colors,
  heightBounds,
  scalarFields,
  sourcePointCount,
  sourcePositions,
}: {
  readonly colorBy: Exclude<PointCloudColorBy, "auto">;
  readonly colors?: Float32Array;
  readonly heightBounds: ReturnType<typeof computeSourceHeightBounds>;
  readonly scalarFields?: readonly PointCloudScalarField[];
  readonly sourcePointCount: number;
  readonly sourcePositions: Float32Array;
}): PointCloudColorSource | null {
  if (colorBy === "uniform") {
    return { kind: "uniform" };
  }

  if (colorBy === "height") {
    return heightColorSource(heightBounds);
  }

  if (colorBy === "rgb") {
    return rgbColorSource(colors, sourcePointCount);
  }

  return scalarColorSource(
    sourcePositions,
    sourcePointCount,
    scalarFields,
    colorBy,
  );
}

function rgbColorSource(
  colors: Float32Array | undefined,
  sourcePointCount: number,
): PointCloudColorSource | null {
  return colors && colors.length >= sourcePointCount * COLOR_COMPONENT_COUNT
    ? { colors, kind: "rgb" }
    : null;
}

function scalarColorSource(
  sourcePositions: Float32Array,
  sourcePointCount: number,
  scalarFields: readonly PointCloudScalarField[] | undefined,
  fieldName: string,
): PointCloudColorSource | null {
  const scalarField = scalarFields?.find(
    (field) => normalizedFieldName(field.name) === fieldName,
  );
  if (!scalarField || scalarField.values.length < sourcePointCount) {
    return null;
  }

  const bounds = computeScalarBounds(sourcePositions, scalarField.values);
  if (!hasUsefulRange(bounds)) {
    return null;
  }

  return {
    kind: "scalar",
    maxValue: bounds.maxValue,
    minValue: bounds.minValue,
    values: scalarField.values,
  };
}

function heightColorSource(
  heightBounds: ReturnType<typeof computeSourceHeightBounds>,
): PointCloudColorSource | null {
  return hasUsefulRange({
    finitePointCount: heightBounds.finitePointCount,
    maxValue: heightBounds.maxHeight,
    minValue: heightBounds.minHeight,
  })
    ? {
        kind: "height",
        maxValue: heightBounds.maxHeight,
        minValue: heightBounds.minHeight,
      }
    : null;
}

function writePointColor(
  target: Float32Array,
  targetOffset: number,
  colorSource: PointCloudColorSource,
  sourcePointIndex: number,
  z: number,
) {
  if (colorSource.kind === "rgb") {
    const sourceOffset = sourcePointIndex * COLOR_COMPONENT_COUNT;
    target[targetOffset] = clamp01(colorSource.colors[sourceOffset]);
    target[targetOffset + 1] = clamp01(colorSource.colors[sourceOffset + 1]);
    target[targetOffset + 2] = clamp01(colorSource.colors[sourceOffset + 2]);
    return;
  }

  if (colorSource.kind === "height") {
    writeHeightColor(
      target,
      targetOffset,
      normalizeValue(z, colorSource.minValue, colorSource.maxValue),
    );
    return;
  }

  if (colorSource.kind === "scalar") {
    const value = colorSource.values[sourcePointIndex];
    if (Number.isFinite(value)) {
      writeHeightColor(
        target,
        targetOffset,
        normalizeValue(value, colorSource.minValue, colorSource.maxValue),
      );
      return;
    }
  }

  writeNeutralColor(target, targetOffset);
}

function computeScalarBounds(
  sourcePositions: Float32Array,
  values: Float32Array,
) {
  let finitePointCount = 0;
  let minValue = Infinity;
  let maxValue = -Infinity;
  const pointCount = Math.min(
    values.length,
    Math.floor(sourcePositions.length / POINT_COMPONENT_COUNT),
  );

  for (let pointIndex = 0; pointIndex < pointCount; pointIndex++) {
    const positionOffset = pointIndex * POINT_COMPONENT_COUNT;
    const x = sourcePositions[positionOffset];
    const y = sourcePositions[positionOffset + Y_COMPONENT_INDEX];
    const z = sourcePositions[positionOffset + Z_COMPONENT_INDEX];
    const value = values[pointIndex];

    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      !Number.isFinite(z) ||
      !Number.isFinite(value)
    ) {
      continue;
    }

    finitePointCount++;
    minValue = Math.min(minValue, value);
    maxValue = Math.max(maxValue, value);
  }

  return {
    finitePointCount,
    maxValue: finitePointCount > 0 ? maxValue : 0,
    minValue: finitePointCount > 0 ? minValue : 0,
  };
}

function hasUsefulRange({
  finitePointCount,
  maxValue,
  minValue,
}: {
  readonly finitePointCount: number;
  readonly maxValue: number;
  readonly minValue: number;
}) {
  return (
    finitePointCount > 0 &&
    Number.isFinite(minValue) &&
    Number.isFinite(maxValue) &&
    maxValue - minValue > HEIGHT_NORMALIZATION_EPSILON
  );
}

function computeSourceHeightBounds(sourcePositions: Float32Array) {
  let finitePointCount = 0;
  let minHeight = Infinity;
  let maxHeight = -Infinity;
  const pointCount = Math.floor(sourcePositions.length / POINT_COMPONENT_COUNT);

  for (let pointIndex = 0; pointIndex < pointCount; pointIndex++) {
    const offset = pointIndex * POINT_COMPONENT_COUNT;
    const x = sourcePositions[offset];
    const y = sourcePositions[offset + Y_COMPONENT_INDEX];
    const z = sourcePositions[offset + Z_COMPONENT_INDEX];

    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      continue;
    }

    finitePointCount++;
    minHeight = Math.min(minHeight, z);
    maxHeight = Math.max(maxHeight, z);
  }

  return {
    finitePointCount,
    maxHeight: finitePointCount > 0 ? maxHeight : 0,
    minHeight: finitePointCount > 0 ? minHeight : 0,
  };
}

function pointCloudObjectTransform(
  frameTransform: PointCloudFrameTransform | undefined,
): PointCloudObjectTransform {
  if (!frameTransform) {
    return {
      position: [0, 0, 0],
      quaternion: [0, 0, 0, 1],
    };
  }

  const { rotation, translation } = frameTransform;
  const length = Math.hypot(rotation.w, rotation.x, rotation.y, rotation.z);
  if (length === 0) {
    return {
      position: [translation.x, translation.y, translation.z],
      quaternion: [0, 0, 0, 1],
    };
  }

  const normalizedRotation = rotation.clone().normalize();
  return {
    position: [translation.x, translation.y, translation.z],
    quaternion: [
      normalizedRotation.x,
      normalizedRotation.y,
      normalizedRotation.z,
      normalizedRotation.w,
    ],
  };
}

function scenePoseObjectTransform(
  pose: ScenePose3D,
): PointCloudObjectTransform {
  const [x, y, z, w] = pose.quaternion;
  const length = Math.hypot(w, x, y, z);

  if (length === 0) {
    return {
      position: [pose.position[0], pose.position[1], pose.position[2]],
      quaternion: [0, 0, 0, 1],
    };
  }

  const normalizedRotation = new THREE.Quaternion(x, y, z, w).normalize();
  return {
    position: [pose.position[0], pose.position[1], pose.position[2]],
    quaternion: [
      normalizedRotation.x,
      normalizedRotation.y,
      normalizedRotation.z,
      normalizedRotation.w,
    ],
  };
}

/**
 * Combined world-space bounds for all current layers. Each layer's geometry
 * bounds start in its local point-cloud frame, so transforms must be applied
 * before the boxes can be unioned for camera fitting.
 *
 * Grid (map) layers can span hundreds of meters, so they never widen bounds
 * that other content already established — otherwise the camera fit would
 * frame the whole city map instead of the ego vehicle. They only drive the
 * fit when they are the only visible content.
 */
function sceneBoundsForLayers(
  layers: readonly PointCloudRenderLayer[],
  annotationLayers: readonly SceneAnnotationPanelLayer[],
  gridLayers: readonly GridPanelLayer[] = [],
): THREE.Box3 | null {
  const sceneBounds = new THREE.Box3();
  sceneBounds.makeEmpty();

  for (const { data, layer } of layers) {
    sceneBounds.union(worldBoundsForLayer(data.bounds, layer.frameTransform));
  }
  for (const layer of annotationLayers) {
    const bounds = boundsForAnnotationLayer(layer);
    if (bounds) {
      sceneBounds.union(bounds);
    }
  }
  if (!sceneBounds.isEmpty()) {
    return sceneBounds;
  }

  for (const layer of gridLayers) {
    const bounds = boundsForGridLayer(layer);
    if (bounds) {
      sceneBounds.union(bounds);
    }
  }

  return sceneBounds.isEmpty() ? null : sceneBounds;
}

function boundsForGridLayer(layer: GridPanelLayer): THREE.Box3 | null {
  const width = layer.frame.columnCount * layer.frame.cellSize[0];
  const height = layer.frame.rowCount * layer.frame.cellSize[1];
  if (!isFinitePositiveNumber(width) || !isFinitePositiveNumber(height)) {
    return null;
  }

  return new THREE.Box3(
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(width, height, 0),
  )
    .applyMatrix4(
      matrixFromObjectTransform(scenePoseObjectTransform(layer.frame.pose)),
    )
    .applyMatrix4(
      matrixFromObjectTransform(
        pointCloudObjectTransform(layer.frameTransform),
      ),
    );
}

function boundsForAnnotationLayer(
  layer: SceneAnnotationPanelLayer,
): THREE.Box3 | null {
  const layerBounds = new THREE.Box3();
  layerBounds.makeEmpty();

  for (const entity of layer.frame.entities) {
    for (const arrow of entity.arrows) {
      const bounds = boundsForSceneArrow(arrow);
      if (bounds) layerBounds.union(bounds);
    }
    for (const cube of entity.cubes) {
      const bounds = boundsForSceneCube(cube);
      if (bounds) layerBounds.union(bounds);
    }
    for (const cylinder of entity.cylinders) {
      const bounds = boundsForSceneCylinder(cylinder);
      if (bounds) layerBounds.union(bounds);
    }
    for (const line of entity.lines) {
      const bounds = boundsForSceneLine(line);
      if (bounds) layerBounds.union(bounds);
    }
    for (const model of entity.models) {
      const bounds = boundsForSceneModel(model);
      if (bounds) layerBounds.union(bounds);
    }
    for (const sphere of entity.spheres) {
      const bounds = boundsForSceneSphere(sphere);
      if (bounds) layerBounds.union(bounds);
    }
    for (const text of entity.texts) {
      const bounds = boundsForSceneText(text);
      if (bounds) layerBounds.union(bounds);
    }
    for (const triangle of entity.triangles) {
      const bounds = boundsForSceneTriangle(triangle);
      if (bounds) layerBounds.union(bounds);
    }
  }

  return layerBounds.isEmpty()
    ? null
    : worldBoundsForLayer(layerBounds, layer.frameTransform);
}

function boundsForSceneArrow(arrow: SceneArrowPrimitive): THREE.Box3 | null {
  const length = Math.max(0, arrow.shaftLength) + Math.max(0, arrow.headLength);
  const radius = Math.max(arrow.shaftDiameter, arrow.headDiameter) / 2;
  if (!isFinitePositiveNumber(length) || !isFinitePositiveNumber(radius)) {
    return null;
  }

  return boundsForBoxWithPose(
    arrow.pose,
    new THREE.Vector3(0, -radius, -radius),
    new THREE.Vector3(length, radius, radius),
  );
}

function boundsForSceneCube(cube: SceneCubePrimitive): THREE.Box3 | null {
  return boundsForPoseAndSize(cube.pose, cube.size);
}

function boundsForSceneCylinder(
  cylinder: SceneCylinderPrimitive,
): THREE.Box3 | null {
  return boundsForPoseAndSize(cylinder.pose, cylinder.size);
}

function boundsForSceneLine(line: SceneLinePrimitive): THREE.Box3 | null {
  return boundsForScenePoints(
    line.points,
    primitivePointIndices(line.points, line.indices),
    line.pose,
  );
}

function boundsForSceneModel(model: SceneModelPrimitive): THREE.Box3 | null {
  return boundsForPoseAndSize(
    model.pose,
    isFinitePositiveVector(model.scale)
      ? model.scale
      : [
          SCENE_MODEL_FALLBACK_SIZE,
          SCENE_MODEL_FALLBACK_SIZE,
          SCENE_MODEL_FALLBACK_SIZE,
        ],
  );
}

function boundsForSceneSphere(sphere: SceneSpherePrimitive): THREE.Box3 | null {
  return boundsForPoseAndSize(sphere.pose, sphere.size);
}

function boundsForSceneText(text: SceneTextPrimitive): THREE.Box3 | null {
  if (!text.text) {
    return null;
  }

  const height = text.scaleInvariant
    ? SCENE_TEXT_DEFAULT_WORLD_HEIGHT
    : Math.max(
        SCENE_TEXT_DEFAULT_WORLD_HEIGHT,
        text.fontSize || SCENE_TEXT_DEFAULT_WORLD_HEIGHT,
      );
  const width = Math.max(height, text.text.length * height * 0.5);

  return boundsForPoseAndSize(text.pose, [width, height, 0.05]);
}

function boundsForSceneTriangle(
  triangle: SceneTrianglePrimitive,
): THREE.Box3 | null {
  return boundsForScenePoints(
    triangle.points,
    primitivePointIndices(triangle.points, triangle.indices),
    triangle.pose,
  );
}

function boundsForPoseAndSize(
  pose: ScenePose3D,
  size: readonly [number, number, number],
): THREE.Box3 | null {
  if (!isFinitePositiveVector(size)) {
    return null;
  }

  return new THREE.Box3()
    .setFromCenterAndSize(new THREE.Vector3(), new THREE.Vector3(...size))
    .applyMatrix4(matrixFromObjectTransform(scenePoseObjectTransform(pose)));
}

function boundsForBoxWithPose(
  pose: ScenePose3D,
  min: THREE.Vector3,
  max: THREE.Vector3,
): THREE.Box3 {
  return new THREE.Box3(min, max).applyMatrix4(
    matrixFromObjectTransform(scenePoseObjectTransform(pose)),
  );
}

function boundsForScenePoints(
  points: readonly ScenePoint3D[],
  pointIndices: readonly number[],
  pose: ScenePose3D,
): THREE.Box3 | null {
  const bounds = new THREE.Box3();
  bounds.makeEmpty();

  for (const pointIndex of pointIndices) {
    const point = points[pointIndex];
    if (isFinitePoint3(point)) {
      bounds.expandByPoint(new THREE.Vector3(...point));
    }
  }

  return bounds.isEmpty()
    ? null
    : bounds.applyMatrix4(
        matrixFromObjectTransform(scenePoseObjectTransform(pose)),
      );
}

/**
 * Converts one layer's local geometry bounds into panel world coordinates.
 * The returned box is cloned so the render data can keep reusing its local
 * bounding box for geometry and future fit calculations.
 */
function worldBoundsForLayer(
  bounds: THREE.Box3,
  frameTransform: PointCloudFrameTransform | undefined,
): THREE.Box3 {
  return bounds
    .clone()
    .applyMatrix4(
      matrixFromObjectTransform(pointCloudObjectTransform(frameTransform)),
    );
}

function matrixFromObjectTransform(transform: PointCloudObjectTransform) {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(...transform.position),
    new THREE.Quaternion(...transform.quaternion),
    new THREE.Vector3(1, 1, 1),
  );
}

/**
 * Frames a bounding box from the panel's default diagonal viewing direction.
 * The radius/FOV calculation places the camera far enough back for the whole
 * box to fit, with padding so points are not pinned to the viewport edge.
 */
function cameraPoseForBounds(
  bounds: THREE.Box3 | null,
): PointCloudCameraPose | null {
  if (!bounds) {
    return null;
  }

  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const radius = Math.max(EMPTY_POINT_CLOUD_BOUNDS_SIZE, size.length() / 2);
  const fovRad = THREE.MathUtils.degToRad(PERSPECTIVE_POINT_CAMERA.fov);
  const distance = (radius / Math.sin(fovRad / 2)) * CAMERA_FIT_PADDING;
  const direction = new THREE.Vector3(...PERSPECTIVE_POINT_CAMERA.position)
    .normalize()
    .multiplyScalar(distance);
  const position = center.clone().add(direction);

  return {
    position: [position.x, position.y, position.z],
    target: [center.x, center.y, center.z],
  };
}

function sceneMaterialProps(
  color: RgbaColor | null,
  maxOpacity: number,
): {
  readonly color: number;
  readonly opacity: number;
  readonly transparent: boolean;
} {
  const [r, g, b, a] = color ?? DEFAULT_SCENE_CUBE_COLOR;

  return {
    color: new THREE.Color(clamp01(r), clamp01(g), clamp01(b)).getHex(),
    opacity: Math.max(0.2, Math.min(maxOpacity, clamp01(a))),
    transparent: true,
  };
}

function primitivePointIndices(
  points: readonly ScenePoint3D[],
  indices: readonly number[],
) {
  const sourceIndices =
    indices.length > 0 ? indices : points.map((_, index) => index);

  return sourceIndices.filter(
    (index) => Number.isInteger(index) && index >= 0 && index < points.length,
  );
}

function lineSegmentPairs(
  pointIndices: readonly number[],
  type: SceneLinePrimitive["type"],
) {
  const pairs: Array<readonly [number, number]> = [];

  if (type === "line-list") {
    for (let index = 0; index + 1 < pointIndices.length; index += 2) {
      pairs.push([pointIndices[index], pointIndices[index + 1]]);
    }
    return pairs;
  }

  for (let index = 0; index + 1 < pointIndices.length; index++) {
    pairs.push([pointIndices[index], pointIndices[index + 1]]);
  }
  if (type === "line-loop" && pointIndices.length > 2) {
    pairs.push([pointIndices[pointIndices.length - 1], pointIndices[0]]);
  }

  return pairs;
}

function rgbComponents(color: RgbaColor | undefined) {
  const [r, g, b] = color ?? DEFAULT_SCENE_CUBE_COLOR;

  return [clamp01(r), clamp01(g), clamp01(b)] as const;
}

function rgbaColorKey(color: RgbaColor) {
  return color.map((component) => clamp01(component).toFixed(4)).join(",");
}

function rgbaCss(color: RgbaColor) {
  const [r, g, b, a] = color;
  return `rgba(${Math.round(clamp01(r) * 255)}, ${Math.round(
    clamp01(g) * 255,
  )}, ${Math.round(clamp01(b) * 255)}, ${clamp01(a)})`;
}

function writeHeightColor(target: Float32Array, offset: number, value: number) {
  const clamped = Math.max(
    NORMALIZED_HEIGHT_MIN,
    Math.min(NORMALIZED_HEIGHT_MAX, value),
  );
  const warm =
    clamped > HEIGHT_COLOR_MIDPOINT
      ? (clamped - HEIGHT_COLOR_MIDPOINT) * HEIGHT_COLOR_SCALE
      : NORMALIZED_HEIGHT_MIN;
  const cool =
    clamped < HEIGHT_COLOR_MIDPOINT
      ? clamped * HEIGHT_COLOR_SCALE
      : NORMALIZED_HEIGHT_MAX;

  target[offset + X_COMPONENT_INDEX] =
    HEIGHT_COLOR_RED_BASE + warm * HEIGHT_COLOR_RED_RANGE;
  target[offset + Y_COMPONENT_INDEX] =
    HEIGHT_COLOR_GREEN_BASE + cool * HEIGHT_COLOR_GREEN_RANGE;
  target[offset + Z_COMPONENT_INDEX] =
    HEIGHT_COLOR_BLUE_BASE - warm * HEIGHT_COLOR_BLUE_WARM_RANGE;
}

function writeNeutralColor(target: Float32Array, offset: number) {
  target[offset] = NEUTRAL_POINT_COLOR[0];
  target[offset + 1] = NEUTRAL_POINT_COLOR[1];
  target[offset + 2] = NEUTRAL_POINT_COLOR[2];
}

function normalizeValue(value: number, min: number, max: number) {
  const span = Math.max(max - min, HEIGHT_NORMALIZATION_EPSILON);

  return (value - min) / span;
}

function normalizedFieldName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

function isFinitePositiveVector(
  value: readonly [number, number, number],
): boolean {
  return value.every(
    (component) => Number.isFinite(component) && component > 0,
  );
}

function isFinitePositiveNumber(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function isFinitePoint3(
  point: ScenePoint3D | undefined,
): point is ScenePoint3D {
  return !!point && point.every((component) => Number.isFinite(component));
}

function pointCountLabel(finitePointCount: number, declaredPointCount: number) {
  if (declaredPointCount > 0 && declaredPointCount !== finitePointCount) {
    return `${formatCount(finitePointCount)} / ${formatCount(
      declaredPointCount,
    )} pts`;
  }

  return `${formatCount(finitePointCount)} pts`;
}

function annotationPrimitiveSummaryForLayers(
  layers: readonly SceneAnnotationPanelLayer[],
): SceneAnnotationPrimitiveSummary {
  const summary = {
    arrowCount: 0,
    cubeCount: 0,
    cylinderCount: 0,
    lineCount: 0,
    modelCount: 0,
    sphereCount: 0,
    textCount: 0,
    totalCount: 0,
    triangleCount: 0,
  };

  for (const layer of layers) {
    for (const entity of layer.frame.entities) {
      summary.arrowCount += entity.arrowCount;
      summary.cubeCount += entity.cubeCount;
      summary.cylinderCount += entity.cylinderCount;
      summary.lineCount += entity.lineCount;
      summary.modelCount += entity.modelCount;
      summary.sphereCount += entity.sphereCount;
      summary.textCount += entity.textCount;
      summary.triangleCount += entity.triangleCount;
    }
  }
  summary.totalCount =
    summary.arrowCount +
    summary.cubeCount +
    summary.cylinderCount +
    summary.lineCount +
    summary.modelCount +
    summary.sphereCount +
    summary.textCount +
    summary.triangleCount;

  return summary;
}

function annotationCountLabel(summary: SceneAnnotationPrimitiveSummary) {
  const families = [
    ["arrow", "arrows", summary.arrowCount],
    ["box", "boxes", summary.cubeCount],
    ["cylinder", "cylinders", summary.cylinderCount],
    ["line", "lines", summary.lineCount],
    ["model", "models", summary.modelCount],
    ["sphere", "spheres", summary.sphereCount],
    ["text", "texts", summary.textCount],
    ["mesh", "meshes", summary.triangleCount],
  ] as const;
  const nonEmptyFamilies = families.filter(([, , count]) => count > 0);

  if (nonEmptyFamilies.length === 1) {
    const [singular, plural, count] = nonEmptyFamilies[0];
    return `${formatCount(count)} ${count === 1 ? singular : plural}`;
  }

  return `${formatCount(summary.totalCount)} annotations`;
}

function gridCountLabel(gridLayerCount: number) {
  return `${formatCount(gridLayerCount)} map ${
    gridLayerCount === 1 ? "layer" : "layers"
  }`;
}

function frustumCountLabel(frustumLayerCount: number) {
  return `${formatCount(frustumLayerCount)} ${
    frustumLayerCount === 1 ? "camera" : "cameras"
  }`;
}

function formatCount(value: number) {
  return Math.round(value).toLocaleString("en-US");
}

const styles: Record<string, CSSProperties> = {
  canvas: {
    display: "block",
    height: "100%",
    width: "100%",
  },
  focusButton: {
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
  focusButtonIcon: {
    flex: "0 0 auto",
    height: 13,
    width: 13,
  },
  hud: {
    background: VISUALIZATION_HUD_BACKGROUND_COLOR,
    border: `1px solid ${VISUALIZATION_HUD_BORDER_COLOR}`,
    borderRadius: HUD_BORDER_RADIUS_PX,
    color: VISUALIZATION_HUD_TEXT_COLOR,
    fontSize: HUD_FONT_SIZE_PX,
    lineHeight: HUD_LINE_HEIGHT,
    padding: "5px 7px",
    position: "absolute",
    right: HUD_OFFSET_PX,
    top: HUD_OFFSET_PX,
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
  focusControls: {
    alignItems: "flex-start",
    display: "flex",
    gap: 6,
    left: HUD_OFFSET_PX,
    position: "absolute",
    top: HUD_OFFSET_PX,
  },
  warning: {
    background: VISUALIZATION_HUD_BACKGROUND_COLOR,
    border: `1px solid ${VISUALIZATION_HUD_BORDER_COLOR}`,
    borderRadius: HUD_BORDER_RADIUS_PX,
    bottom: HUD_OFFSET_PX,
    color: VISUALIZATION_HUD_TEXT_COLOR,
    fontSize: HUD_FONT_SIZE_PX,
    left: HUD_OFFSET_PX,
    lineHeight: 1.2,
    maxWidth: "calc(100% - 16px)",
    padding: "5px 7px",
    position: "absolute",
  },
};
