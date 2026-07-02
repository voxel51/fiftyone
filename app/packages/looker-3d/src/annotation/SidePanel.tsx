import { useAnnotationEventHandler } from "@fiftyone/annotation";
import { useTheme } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import { ModalSample } from "@fiftyone/state";
import FitScreenIcon from "@mui/icons-material/FitScreen";
import { IconButton, MenuItem, Select } from "@mui/material";
import {
  Bounds,
  MapControls,
  OrthographicCamera,
  useBounds,
  View,
} from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRecoilValue } from "recoil";
import styled from "styled-components";
import * as THREE from "three";
import type { MapControls as MapControlsImpl } from "three-stdlib";
import { Box3, Vector3 } from "three";
import {
  ANNOTATION_CUBOID,
  FO_USER_DATA,
  getPanelElementId,
  getSidePanelGridArea,
  PANEL_ID_SIDE_TOP,
  UNFOCUSED_LABEL_OPACITY,
  VIEW_TYPE_BACK,
  VIEW_TYPE_BOTTOM,
  VIEW_TYPE_FRONT,
  VIEW_TYPE_LEFT,
  VIEW_TYPE_RIGHT,
  VIEW_TYPE_TOP,
} from "../constants";
import { FoSceneComponent } from "../fo3d/FoScene";
import { Gizmos } from "../fo3d/Gizmos";
import { FoScene } from "../fo3d/render-types";
import { Lights } from "../fo3d/scene-controls/lights/Lights";
import { ThreeDLabels } from "../labels";
import { RaycastService } from "../services/RaycastService";
import {
  isCurrentlyTransformingAtom,
  selectedLabelForAnnotationAtom,
  useMainPanelNavigationSyncIntents,
} from "../state";
import type { SidePanelId, SidePanelViewType } from "../types";
import { expandBoundingBox, findObjectByUserData } from "../utils";
import {
  applyHeadingToSidePanelCameraFrame,
  applySidePanelCameraFrame,
  applyVisibleWorldHeightZoomToOrthographicCamera,
  applyMainPanelPanSyncIntentToOrthographicCamera,
  applyMainPanelZoomSyncIntentToOrthographicCamera,
  applyPointCloudCropMainPanelSyncToOrthographicCamera,
  deriveSidePanelCameraFrame,
  getSidePanelHeadingQuaternion,
  doesPointCloudCropFitCamera,
  retargetSidePanelCameraFrame,
  shouldApplyMainPanelNavigationSyncIntent,
  shouldApplyMainPanelPanSyncIntent,
  type SidePanelCameraFrame,
  type SidePanelControls,
} from "../utils/side-panel-camera-sync";
import type { PointCloudCrop } from "../utils/point-cloud-crop";
import {
  createPointCloudCropHelperMesh,
  disposePointCloudCropHelperMesh,
} from "../utils/point-cloud-crop";
import { AnnotationPlane } from "./AnnotationPlane";
import { CreateCuboidRenderer } from "./CreateCuboidRenderer";
import { Crosshair3D } from "./Crosshair3D";
import {
  decodeImageSliceView,
  encodeImageSliceView,
  ImageSlicePanel,
  isImageSliceView,
} from "./ImageSlicePanel";
import { SegmentPolylineRenderer } from "./SegmentPolylineRenderer";
import { useImageSlicesIfAvailable } from "./useImageSlicesIfAvailable";
import { usePointCloudCrop } from "./usePointCloudCrop";

const SidePanelContainer = styled.div<{ $area: string }>`
  grid-area: ${(p) => p.$area};
  position: relative;
  z-index: 200;
`;

const ViewSelectorWrapper = styled.div`
  position: absolute;
  width: 95%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  top: 10px;
  left: 10px;
  z-index: 1000;
`;

/**
<<<<<<< HEAD
 * Calculate camera position for different side panel views based on upVector and lookAt point
 */
const calculateCameraPositionForSidePanel = (
  sidePanelViewType: SidePanelViewType,
  upVector: Vector3,
  lookAt: Vector3,
  sceneBoundingBox: Box3 | null,
): Vector3 => {
  if (!sceneBoundingBox) {
    // Fallback to default positions if no bounding box
    const defaultPositions = {
      Top: [0, 10, 0] as [number, number, number],
      Bottom: [0, -10, 0] as [number, number, number],
      Left: [-10, 0, 0] as [number, number, number],
      Right: [10, 0, 0] as [number, number, number],
      Back: [0, 0, -10] as [number, number, number],
      Front: [0, 0, 10] as [number, number, number],
    };
    const position = defaultPositions[sidePanelViewType];
    return position ? new Vector3(...position) : new Vector3(0, 10, 0);
  }

  const size = new Vector3();
  sceneBoundingBox.getSize(size);
  const maxSize = Math.max(size.x, size.y, size.z);
  const distance = maxSize * 2.5;

  const upDir = upVector.clone().normalize();
  const center = lookAt.clone();

  // Create orthogonal vectors for different views
  let direction: Vector3;

  switch (sidePanelViewType) {
    case VIEW_TYPE_TOP:
      direction = upDir.clone();
      break;
    case VIEW_TYPE_BOTTOM:
      direction = upDir.clone().negate();
      break;
    case VIEW_TYPE_LEFT:
      // Create a vector perpendicular to up vector
      if (Math.abs(upDir.y) > 0.9) {
        // If up is mostly Y, use negative X axis for left
        direction = new Vector3(-1, 0, 0);
      } else {
        const right = new Vector3(0, 1, 0).cross(upDir).normalize();
        direction = right.negate();
      }
      break;
    case VIEW_TYPE_RIGHT:
      // Opposite of Left
      if (Math.abs(upDir.y) > 0.9) {
        direction = new Vector3(1, 0, 0);
      } else {
        direction = new Vector3(0, 1, 0).cross(upDir).normalize();
      }
      break;
    case VIEW_TYPE_FRONT:
      // Create a vector perpendicular to both up and left
      if (Math.abs(upDir.y) > 0.9) {
        direction = new Vector3(0, 0, 1);
      } else {
        const left = new Vector3(0, -1, 0).cross(upDir).normalize();
        direction = upDir.clone().cross(left).normalize();
      }
      break;
    case VIEW_TYPE_BACK:
      // Opposite of Front
      if (Math.abs(upDir.y) > 0.9) {
        direction = new Vector3(0, 0, -1);
      } else {
        const left = new Vector3(0, 1, 0).cross(upDir).normalize();
        direction = upDir.clone().cross(left).normalize();
      }
      break;
    default:
      direction = upDir.clone();
  }

  return center.clone().add(direction.multiplyScalar(distance));
};

/**
 * Calculate camera "up" vector for different side panel views to ensure proper axis alignment
 */
const calculateCameraUpForSidePanel = (
  sidePanelViewType: SidePanelViewType,
  upVector: Vector3,
): Vector3 => {
  const upDir = upVector.clone().normalize();

  switch (sidePanelViewType) {
    case VIEW_TYPE_TOP: {
      // For Top view, camera is looking down along upDir
      // Camera's "up" must be perpendicular to the viewing direction
      // Find a horizontal vector perpendicular to upDir
      // Match the convention used by Front/Back views for consistency

      let candidate: Vector3;

      // If upDir is mostly aligned with Y axis (Y-up scene)
      // Front view looks along +Z, so camera up should be along +Z
      if (Math.abs(upDir.y) > 0.9) {
        candidate = new Vector3(0, 0, 1);
      }
      // If upDir is mostly aligned with Z axis (Z-up scene)
      // Camera up should be along +Y
      else if (Math.abs(upDir.z) > 0.9) {
        candidate = new Vector3(0, 1, 0);
      }
      // If upDir is mostly aligned with X axis (X-up scene)
      // Use Y axis as candidate
      else if (Math.abs(upDir.x) > 0.9) {
        candidate = new Vector3(0, 1, 0);
      }
      // General case: use a vector perpendicular to upDir
      else {
        // Find a vector perpendicular to upDir using cross product
        const temp = new Vector3(0, 1, 0);
        if (Math.abs(upDir.dot(temp)) > 0.9) {
          temp.set(1, 0, 0);
        }
        candidate = new Vector3().crossVectors(temp, upDir).normalize();
      }

      // Project candidate onto plane perpendicular to upDir
      // This gives us a vector perpendicular to upDir
      const projection = candidate
        .clone()
        .sub(upDir.clone().multiplyScalar(candidate.dot(upDir)))
        .normalize();

      // If projection is too small (nearly parallel), try another axis
      if (projection.length() < 0.1) {
        // Try different axes as fallback
        const fallback =
          Math.abs(upDir.y) > 0.9
            ? new Vector3(1, 0, 0) // For Y-up, try X
            : new Vector3(0, 0, 1); // Otherwise try Z
        const fallbackProjection = fallback
          .clone()
          .sub(upDir.clone().multiplyScalar(fallback.dot(upDir)))
          .normalize();
        return fallbackProjection.length() > 0.1
          ? fallbackProjection
          : new Vector3(0, 0, 1);
      }

      return projection;
    }
    case VIEW_TYPE_BOTTOM: {
      // For Bottom view, camera is looking up along -upDir
      // Camera's "up" must be perpendicular to the viewing direction
      // Use similar logic to Top but apply cross product to maintain correct orientation

      let candidate: Vector3;

      // Match Top view logic for candidate selection
      // If upDir is mostly aligned with Y axis (Y-up scene)
      // Front view looks along +Z, so camera up should be along +Z
      if (Math.abs(upDir.y) > 0.9) {
        candidate = new Vector3(0, 0, 1);
      }
      // If upDir is mostly aligned with Z axis (Z-up scene)
      // Camera up should be along +Y
      else if (Math.abs(upDir.z) > 0.9) {
        candidate = new Vector3(0, 1, 0);
      }
      // If upDir is mostly aligned with X axis (X-up scene)
      // Use Y axis as candidate
      else if (Math.abs(upDir.x) > 0.9) {
        candidate = new Vector3(0, 1, 0);
      }
      // General case: use a vector perpendicular to upDir
      else {
        const temp = new Vector3(0, 1, 0);
        if (Math.abs(upDir.dot(temp)) > 0.9) {
          temp.set(1, 0, 0);
        }
        candidate = new Vector3().crossVectors(temp, upDir).normalize();
      }

      const projection = candidate
        .clone()
        .sub(upDir.clone().multiplyScalar(candidate.dot(upDir)))
        .normalize();

      if (projection.length() < 0.1) {
        const fallback =
          Math.abs(upDir.y) > 0.9 ? new Vector3(1, 0, 0) : new Vector3(0, 0, 1);
        const fallbackProjection = fallback
          .clone()
          .sub(upDir.clone().multiplyScalar(fallback.dot(upDir)))
          .normalize();
        if (fallbackProjection.length() > 0.1) {
          // Apply cross product for Bottom view orientation
          const right = new Vector3()
            .crossVectors(fallbackProjection, upDir)
            .normalize();
          const bottomUp = new Vector3()
            .crossVectors(right, upDir.clone().negate())
            .normalize();
          return bottomUp.length() > 0.1 ? bottomUp : fallbackProjection;
        }
        return new Vector3(0, 0, 1);
      }

      // For Bottom view, use cross product to get correct orientation
      // Cross product with upDir to get a right vector, then use that to determine orientation
      const right = new Vector3().crossVectors(projection, upDir).normalize();
      // Use the right vector crossed with the viewing direction (-upDir) to get the proper up
      const bottomUp = new Vector3()
        .crossVectors(right, upDir.clone().negate())
        .normalize();

      return bottomUp.length() > 0.1 ? bottomUp : projection;
    }
    case VIEW_TYPE_LEFT:
    case VIEW_TYPE_RIGHT:
    case VIEW_TYPE_FRONT:
    case VIEW_TYPE_BACK:
      // For these views, camera is looking perpendicular to upDir
      // Camera's "up" should be along upDir (or its appropriate orientation)
      return upDir.clone();
    default:
      return upDir.clone();
  }
};

/**
=======
>>>>>>> main
 * Returns a dropdown value that is guaranteed to exist in the current side-panel
 * options.
 *
 * Stored `slice_*` panel views can temporarily become invalid while image slices
 * are loading or permanently invalid when the `/groups` lookup fails or no longer
 * returns that slice. In those cases we fall back to a stable cardinal view so the
 * select stays controlled and the rest of the side-panel can keep rendering.
 */
const getSafeSidePanelSelectValue = ({
  panelId,
  view,
  imageSlices,
  isLoadingImageSlices,
}: {
  panelId: SidePanelId;
  view: SidePanelViewType;
  imageSlices: string[];
  isLoadingImageSlices: boolean;
}) => {
  if (!isImageSliceView(view)) {
    return view;
  }

  if (isLoadingImageSlices) {
    return panelId === PANEL_ID_SIDE_TOP ? VIEW_TYPE_TOP : VIEW_TYPE_LEFT;
  }

  const sliceName = decodeImageSliceView(view);

  if (!sliceName || !imageSlices.includes(sliceName)) {
    return panelId === PANEL_ID_SIDE_TOP ? VIEW_TYPE_TOP : VIEW_TYPE_LEFT;
  }

  return view;
};

// Re-fit the side panel via <Bounds> for this long after a view change/reset,
// then release control so the user can freely pan/zoom.
const SIDE_PANEL_FIT_OBSERVE_DURATION_MS = 750;
// <Bounds> framing margin and (near-instant) fit animation duration.
const SIDE_PANEL_BOUNDS_FIT_MARGIN = 1.25;
const SIDE_PANEL_BOUNDS_FIT_MAX_DURATION = 0.001;

export interface SidePanelProps {
  panelId: SidePanelId;
  view: SidePanelViewType;
  setView: (view: SidePanelViewType) => void;
  foScene: FoScene;
  upVector: Vector3 | null;
  lookAt: Vector3 | null;
  sceneBoundingBox: Box3 | null;
  isSceneInitialized: boolean;
  sample: ModalSample;
}

export const SidePanel = ({
  panelId,
  view,
  setView,
  foScene,
  upVector,
  lookAt,
  sceneBoundingBox,
  isSceneInitialized,
  sample,
}: SidePanelProps) => {
  const { activeSampleMap: labelSampleMap } = fos.useRenderConfig3dState();
  const { imageSlices, resolveUrlForImageSlice, isLoadingImageSlices } =
    useImageSlicesIfAvailable(sample);

  // While a label transform is in progress (e.g. a cuboid face-pull resize
  // started in this panel), suspend panning so the drag doesn't also move the
  // orthographic camera. Mirrors the main panel's controls gating.
  const isCurrentlyTransforming = useRecoilValue(isCurrentlyTransformingAtom);

  const gridArea = getSidePanelGridArea(panelId);
  const safeSelectValue = getSafeSidePanelSelectValue({
    panelId,
    view,
    imageSlices,
    isLoadingImageSlices,
  });
  const showImageSlicePanel =
    isImageSliceView(view) && safeSelectValue === view;
  const pointCloudCrop = usePointCloudCrop({
    enabled: !showImageSlicePanel,
  });

  const sidePanelCameraFrame = useMemo(
    () =>
<<<<<<< HEAD
      upVector && lookAt
        ? calculateCameraPositionForSidePanel(
            safeSelectValue,
            upVector,
            lookAt,
            sceneBoundingBox,
          )
        : new Vector3(0, 10, 0),
    [safeSelectValue, upVector, lookAt, sceneBoundingBox],
  );

  const cameraUp = useMemo(
    () =>
      upVector
        ? calculateCameraUpForSidePanel(safeSelectValue, upVector)
        : new Vector3(0, 1, 0),
    [safeSelectValue, upVector],
=======
      deriveSidePanelCameraFrame({
        sceneBoundingBox,
        target: lookAt ?? new Vector3(0, 0, 0),
        upVector: upVector ?? new Vector3(0, 1, 0),
        viewType: safeSelectValue,
      }),
    [safeSelectValue, upVector, lookAt, sceneBoundingBox],
>>>>>>> main
  );

  const theme = useTheme();
  const mapControlsRef = useRef<MapControlsImpl | null>(null);

  // We can't use drei's `useBounds()` here (it only works inside the <Bounds>
  // tree), so a `fitBoundsKey` counter coordinates the re-fit on view change or
  // reset: it remounts the <View> for a clean camera/controls re-init, then
  // briefly runs a cardinal-aware Bounds fit that we release after
  // SIDE_PANEL_FIT_OBSERVE_DURATION_MS so the user can pan/zoom freely.
  const [observe, setObserve] = useState(true);

  const [fitBoundsKey, setFitBoundsKey] = useState(0);
  const pointCloudCropFitKey = pointCloudCrop
    ? pointCloudCrop.source === "raycast-hover"
      ? null
      : `${pointCloudCrop.source}-${pointCloudCrop.labelId}-${fitBoundsKey}`
    : null;

  useEffect(() => {
    setObserve(true);
    const timer = setTimeout(() => {
      setObserve(false);
    }, SIDE_PANEL_FIT_OBSERVE_DURATION_MS);

    return () => clearTimeout(timer);
  }, [fitBoundsKey]);

  return (
    <SidePanelContainer id={getPanelElementId(panelId)} $area={gridArea}>
      {showImageSlicePanel ? (
        <ImageSlicePanel
          panelId={panelId}
          view={view}
          setView={setView}
          imageSlices={imageSlices}
          isLoadingImageSlices={isLoadingImageSlices}
          resolveUrlForImageSlice={resolveUrlForImageSlice}
          upVector={upVector}
        />
      ) : (
        <View
          key={`${panelId}-${safeSelectValue}-${fitBoundsKey}`}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
          }}
        >
          <OrthographicCamera
            makeDefault
            position={sidePanelCameraFrame.position}
            up={sidePanelCameraFrame.up.toArray() as [number, number, number]}
          />
          <MapControls
            makeDefault
            ref={mapControlsRef}
            screenSpacePanning
            zoomToCursor
            enableRotate={false}
            enablePan={!isCurrentlyTransforming}
            zoomSpeed={0.8}
          />
          <SidePanelCameraFrameController
            controlsRef={mapControlsRef}
            frame={sidePanelCameraFrame}
          />
          <Bounds
            margin={SIDE_PANEL_BOUNDS_FIT_MARGIN}
            maxDuration={SIDE_PANEL_BOUNDS_FIT_MAX_DURATION}
          >
            <BoundsSideEffectsComponent
              observe={!pointCloudCrop && observe}
              pointCloudCrop={pointCloudCrop}
              pointCloudCropFitKey={pointCloudCropFitKey}
              sidePanelCameraFrame={sidePanelCameraFrame}
              upVector={upVector}
            />
            <Gizmos isGridVisible={false} isGizmoHelperVisible={false} />
            <group visible={isSceneInitialized}>
              <FoSceneComponent
                scene={foScene}
                pointCloudCrop={pointCloudCrop}
              />
            </group>
            {isSceneInitialized && (
              <ThreeDLabels
                sampleMap={labelSampleMap}
                globalOpacity={0.5}
                isMainPanel={false}
                panelId={panelId}
                dimAllLabels={pointCloudCrop?.source === "raycast-hover"}
                unfocusedLabelOpacity={UNFOCUSED_LABEL_OPACITY}
              />
            )}
            {/* `safeSelectValue` is guaranteed to be a cardinal view here */}
            <AnnotationPlane
              showTransformControls={false}
              panelType="side"
              viewType={
                safeSelectValue.toLowerCase() as
                  | "top"
                  | "bottom"
                  | "right"
                  | "left"
                  | "front"
                  | "back"
              }
            />
            <RaycastService panelId={panelId} pointCloudCrop={pointCloudCrop} />
            <SegmentPolylineRenderer ignoreEffects />
            <CreateCuboidRenderer ignoreEffects />
            <Crosshair3D panelId={panelId} />
          </Bounds>
          <Lights lights={foScene?.lights} />
        </View>
      )}
      <ViewSelectorWrapper>
        <Select
          value={safeSelectValue}
          onChange={(e) => {
            setView(e.target.value as SidePanelViewType);
            setFitBoundsKey((prev) => prev + 1);
          }}
          size="small"
          sx={{
            backgroundColor: theme.background.level3,
            "& .MuiSelect-select": {
              padding: "6px 10px",
              fontSize: "12px",
            },
          }}
          MenuProps={{
            sx: {
              zIndex: 1002,
            },
          }}
        >
          <MenuItem value={VIEW_TYPE_TOP}>Top</MenuItem>
          <MenuItem value={VIEW_TYPE_BOTTOM}>Bottom</MenuItem>
          <MenuItem value={VIEW_TYPE_LEFT}>Left</MenuItem>
          <MenuItem value={VIEW_TYPE_RIGHT}>Right</MenuItem>
          <MenuItem value={VIEW_TYPE_FRONT}>Front</MenuItem>
          <MenuItem value={VIEW_TYPE_BACK}>Back</MenuItem>
          {imageSlices &&
            imageSlices.map((slice) => (
              <MenuItem key={slice} value={encodeImageSliceView(slice)}>
                Image Slice: {slice}
              </MenuItem>
            ))}
        </Select>
        <IconButton
          color="secondary"
          onClick={() => {
            setFitBoundsKey((prev) => prev + 1);
          }}
          title="Reset and fit"
        >
          <FitScreenIcon />
        </IconButton>
      </ViewSelectorWrapper>
    </SidePanelContainer>
  );
};

<<<<<<< HEAD
function findByUserData(
  scene: THREE.Scene,
  key: (typeof FO_USER_DATA)[keyof typeof FO_USER_DATA],
  value: unknown,
): THREE.Object3D | null {
  let result: THREE.Object3D | null = null;
  scene.traverse((o) => {
    if (o.userData?.[key] === value) {
      result = o as THREE.Object3D;
    }
  });
  return result;
}

=======
>>>>>>> main
const DEFAULT_CUBOID_CREATION_MARGIN = 50;
const DEFAULT_POLYLINE_VERTEX_FOCUS_SIZE = 5;
const MIN_POLYLINE_VERTEX_FOCUS_SIZE = 1;
const MAX_POLYLINE_VERTEX_FOCUS_SIZE = 30;
const AUTO_EXPAND_FIT_INTERVAL_MS = 125;
const RAYCAST_HOVER_SYNC_INTERVAL_MS = 125;
const RAYCAST_HOVER_CENTER_EPSILON_SQ = 1e-8;

interface RaycastHoverSyncSnapshot {
  center: THREE.Vector3;
  halfSize: THREE.Vector3;
  visibleWorldHeightAtCenter?: number | null;
}

const SidePanelCameraFrameController = ({
  controlsRef,
  frame,
}: {
  controlsRef: { current: SidePanelControls | null };
  frame: SidePanelCameraFrame;
}) => {
  const { camera, invalidate } = useThree();
  const fallbackControls = useThree(
    (state) => state.controls as SidePanelControls | undefined,
  );

  useLayoutEffect(() => {
    const controls = controlsRef.current ?? fallbackControls;

    applySidePanelCameraFrame({
      camera,
      controls,
      frame,
      invalidate,
    });
  }, [camera, controlsRef, fallbackControls, frame, invalidate]);

  return null;
};

const BoundsSideEffectsComponent = ({
  observe,
  pointCloudCrop,
  pointCloudCropFitKey,
  sidePanelCameraFrame,
  upVector,
}: {
  observe: boolean;
  pointCloudCrop?: PointCloudCrop | null;
  pointCloudCropFitKey: string | null;
  sidePanelCameraFrame: SidePanelCameraFrame;
  upVector: Vector3 | null;
}) => {
  const api = useBounds();
  const selectedLabel = useRecoilValue(selectedLabelForAnnotationAtom);
  const selectedLabelId = selectedLabel?._id ?? null;
  const previousSelectedLabelIdRef = useRef<string | null>(null);

  const { camera, scene, invalidate } = useThree();
  const controls = useThree(
    (state) => state.controls as SidePanelControls | undefined,
  );
  const { mainPanelPanSyncIntent, mainPanelZoomSyncIntent } =
    useMainPanelNavigationSyncIntents();
  const pointCloudCropRef = useRef(pointCloudCrop);
  const lastAutoExpandFitAtRef = useRef(0);
  const lastRaycastHoverSyncAtRef = useRef(0);
  const lastRaycastHoverSyncRef = useRef<RaycastHoverSyncSnapshot | null>(null);
  const lastHandledMainPanelPanSyncIntentRef = useRef<string | null>(null);
  const lastHandledMainPanelZoomSyncIntentRef = useRef<string | null>(null);

  useEffect(() => {
    pointCloudCropRef.current = pointCloudCrop;
  }, [pointCloudCrop]);

  // Geometry identity of the active crop. The re-fit effects below read the
  // latest crop through a ref, so they key off these derived signatures rather
  // than spreading every vector component across their dependency arrays.
  const cropGeometrySignature = useMemo(() => {
    const crop = pointCloudCrop;
    if (!crop) {
      return null;
    }
    return [
      crop.source,
      crop.center.x,
      crop.center.y,
      crop.center.z,
      crop.halfSize.x,
      crop.halfSize.y,
      crop.halfSize.z,
      crop.quaternion.x,
      crop.quaternion.y,
      crop.quaternion.z,
      crop.quaternion.w,
    ].join(",");
  }, [pointCloudCrop]);

  const raycastHoverCropSignature = useMemo(() => {
    if (cropGeometrySignature === null) {
      return null;
    }
    return `${cropGeometrySignature},${pointCloudCrop?.visibleWorldHeightAtCenter}`;
  }, [cropGeometrySignature, pointCloudCrop?.visibleWorldHeightAtCenter]);

  const fitBoundsWithSidePanelFrame = useCallback(
    (
      object: THREE.Object3D | THREE.Box3 | undefined,
      target: THREE.Vector3,
      shouldClip = false,
      baseFrame: SidePanelCameraFrame = sidePanelCameraFrame,
    ) => {
      const frame = retargetSidePanelCameraFrame(baseFrame, target);
      applySidePanelCameraFrame({
        camera,
        controls,
        frame,
        invalidate,
      });

      const bounds = api
        .refresh(object)
        .moveTo(frame.position)
        .lookAt({ target: frame.target, up: frame.up })
        .fit();

      if (shouldClip) {
        bounds.clip();
      }
    },
    [api, camera, controls, invalidate, sidePanelCameraFrame],
  );

  const fitToTemporaryMesh = useCallback(
    (
      helperMesh: THREE.Mesh,
      target: THREE.Vector3,
      dispose: () => void,
      baseFrame: SidePanelCameraFrame = sidePanelCameraFrame,
    ) => {
      scene.add(helperMesh);
      fitBoundsWithSidePanelFrame(helperMesh, target, false, baseFrame);

      setTimeout(() => {
        scene.remove(helperMesh);
        dispose();
      }, 0);
    },
    [fitBoundsWithSidePanelFrame, scene, sidePanelCameraFrame],
  );

  const fitToPointCloudCrop = useCallback(
    (crop: PointCloudCrop) => {
      const helperMesh = createPointCloudCropHelperMesh(crop);
      fitToTemporaryMesh(helperMesh, crop.center, () =>
        disposePointCloudCropHelperMesh(helperMesh),
      );
    },
    [fitToTemporaryMesh],
  );

  const centerOnPointCloudCrop = useCallback(
    (crop: PointCloudCrop) => {
      const frame = retargetSidePanelCameraFrame(
        sidePanelCameraFrame,
        crop.center,
      );

      applySidePanelCameraFrame({
        camera,
        controls,
        frame,
        invalidate,
      });

      applyVisibleWorldHeightZoomToOrthographicCamera({
        camera,
        controls,
        invalidate,
        visibleWorldHeight: crop.visibleWorldHeightAtCenter,
      });

      if (!doesPointCloudCropFitCamera(crop, camera)) {
        fitToPointCloudCrop(crop);
      }
    },
    [camera, controls, fitToPointCloudCrop, invalidate, sidePanelCameraFrame],
  );

  const fitToBox = useCallback(
    (
      box: THREE.Box3,
      baseFrame: SidePanelCameraFrame = sidePanelCameraFrame,
    ) => {
      const boxSize = box.getSize(new Vector3());
      const boxCenter = box.getCenter(new Vector3());
      const boxGeometry = new THREE.BoxGeometry(
        boxSize.x,
        boxSize.y,
        boxSize.z,
      );
      const boxMaterial = new THREE.MeshBasicMaterial({ visible: false });
      const helperMesh = new THREE.Mesh(boxGeometry, boxMaterial);
      helperMesh.position.copy(boxCenter);
      helperMesh.visible = false;

      fitToTemporaryMesh(
        helperMesh,
        boxCenter,
        () => {
          boxGeometry.dispose();
          boxMaterial.dispose();
        },
        baseFrame,
      );
    },
    [fitToTemporaryMesh, sidePanelCameraFrame],
  );

  const fitToCenteredBox = useCallback(
    (center: THREE.Vector3Tuple, size: number) => {
      fitToBox(
        new Box3().setFromCenterAndSize(
          new Vector3(...center),
          new Vector3(size, size, size),
        ),
      );
    },
    [fitToBox],
  );

  useEffect(() => {
    if (!observe || pointCloudCropRef.current) {
      return;
    }

    fitBoundsWithSidePanelFrame(undefined, sidePanelCameraFrame.target, true);
  }, [fitBoundsWithSidePanelFrame, observe, sidePanelCameraFrame.target]);

  useEffect(() => {
    const crop = pointCloudCropRef.current;
    if (!crop || !pointCloudCropFitKey) {
      return;
    }

    fitToPointCloudCrop(crop);
  }, [fitToPointCloudCrop, pointCloudCropFitKey]);

  useEffect(() => {
    const crop = pointCloudCropRef.current;
    if (!crop || crop.source !== "creation") {
      return;
    }

    if (doesPointCloudCropFitCamera(crop, camera)) {
      return;
    }

    const now = Date.now();
    if (now - lastAutoExpandFitAtRef.current < AUTO_EXPAND_FIT_INTERVAL_MS) {
      return;
    }

    lastAutoExpandFitAtRef.current = now;
    fitToPointCloudCrop(crop);
  }, [camera, fitToPointCloudCrop, cropGeometrySignature]);

  useEffect(() => {
    const crop = pointCloudCropRef.current;
    if (!crop || crop.source !== "raycast-hover") {
      lastRaycastHoverSyncAtRef.current = 0;
      lastRaycastHoverSyncRef.current = null;
      return;
    }

    // Raycast-hover crops track the pointer. When the current crop already
    // fits the side panel, keep the user's zoom/pan stable and only let the
    // crop mask update. Re-centering every hovered point is especially visible
    // as vertical jitter at high zoom.
    if (doesPointCloudCropFitCamera(crop, camera)) {
      return;
    }

    const lastSync = lastRaycastHoverSyncRef.current;
    if (
      lastSync &&
      lastSync.center.distanceToSquared(crop.center) <=
        RAYCAST_HOVER_CENTER_EPSILON_SQ &&
      lastSync.halfSize.distanceToSquared(crop.halfSize) <=
        RAYCAST_HOVER_CENTER_EPSILON_SQ &&
      lastSync.visibleWorldHeightAtCenter === crop.visibleWorldHeightAtCenter
    ) {
      return;
    }

    const now = Date.now();
    if (
      lastSync &&
      now - lastRaycastHoverSyncAtRef.current < RAYCAST_HOVER_SYNC_INTERVAL_MS
    ) {
      return;
    }

    lastRaycastHoverSyncAtRef.current = now;
    lastRaycastHoverSyncRef.current = {
      center: crop.center.clone(),
      halfSize: crop.halfSize.clone(),
      visibleWorldHeightAtCenter: crop.visibleWorldHeightAtCenter,
    };

    if (
      !applyPointCloudCropMainPanelSyncToOrthographicCamera({
        camera,
        controls,
        crop,
        invalidate,
      })
    ) {
      centerOnPointCloudCrop(crop);
    }
  }, [
    camera,
    centerOnPointCloudCrop,
    controls,
    invalidate,
    raycastHoverCropSignature,
  ]);

  useEffect(() => {
    if (
      !mainPanelZoomSyncIntent ||
      lastHandledMainPanelZoomSyncIntentRef.current ===
        mainPanelZoomSyncIntent.id
    ) {
      return;
    }

    lastHandledMainPanelZoomSyncIntentRef.current = mainPanelZoomSyncIntent.id;

    if (
      !shouldApplyMainPanelNavigationSyncIntent({
        activeCrop: pointCloudCropRef.current,
        intent: mainPanelZoomSyncIntent,
        now: Date.now(),
      })
    ) {
      return;
    }

    applyMainPanelZoomSyncIntentToOrthographicCamera({
      camera,
      controls,
      intent: mainPanelZoomSyncIntent,
      invalidate,
    });
  }, [camera, controls, invalidate, mainPanelZoomSyncIntent]);

  useEffect(() => {
    if (
      !mainPanelPanSyncIntent ||
      lastHandledMainPanelPanSyncIntentRef.current === mainPanelPanSyncIntent.id
    ) {
      return;
    }

    lastHandledMainPanelPanSyncIntentRef.current = mainPanelPanSyncIntent.id;

    if (
      !shouldApplyMainPanelPanSyncIntent({
        activeCrop: pointCloudCropRef.current,
        intent: mainPanelPanSyncIntent,
        now: Date.now(),
      })
    ) {
      return;
    }

    applyMainPanelPanSyncIntentToOrthographicCamera({
      camera,
      controls,
      intent: mainPanelPanSyncIntent,
      invalidate,
    });
  }, [camera, controls, invalidate, mainPanelPanSyncIntent]);

  const getVertexFocusBoxSize = () => {
    const sceneBounds = new Box3().setFromObject(scene);
    if (sceneBounds.isEmpty()) {
      return DEFAULT_POLYLINE_VERTEX_FOCUS_SIZE;
    }

    const sceneSize = sceneBounds.getSize(new Vector3());
    const maxSceneDimension = Math.max(sceneSize.x, sceneSize.y, sceneSize.z);
    return THREE.MathUtils.clamp(
      maxSceneDimension * 0.05,
      MIN_POLYLINE_VERTEX_FOCUS_SIZE,
      MAX_POLYLINE_VERTEX_FOCUS_SIZE,
    );
  };

  // This effect reverts to the world-aligned scene framing when a label is
  // deselected. The select path heading-aligns to the box, so deselection has
  // to actively restore the default cardinal view.
  useEffect(() => {
    const previousSelectedLabelId = previousSelectedLabelIdRef.current;
    previousSelectedLabelIdRef.current = selectedLabelId;

    if (
      previousSelectedLabelId &&
      !selectedLabelId &&
      !pointCloudCropRef.current
    ) {
      fitBoundsWithSidePanelFrame(undefined, sidePanelCameraFrame.target, true);
    }
  }, [
    selectedLabelId,
    fitBoundsWithSidePanelFrame,
    sidePanelCameraFrame.target,
  ]);

  useAnnotationEventHandler("annotation:3dLabelSelected", (payload) => {
    const { label, archetype } = payload;
    const crop = pointCloudCropRef.current;

    if (crop?.labelId === label._id) {
      fitToPointCloudCrop(crop);
      return;
    }

    const object = findObjectByUserData(
      scene,
      FO_USER_DATA.LABEL_ID,
      label._id,
    );

    if (object) {
      // For cuboids, align the orthographic view to the box's heading so it
      // appears axis-aligned (faces edge-on, handles straight out). The box's
      // live world orientation comes straight off its scene object. Polylines
      // keep the world-aligned frame.
      const frame =
        archetype === ANNOTATION_CUBOID
          ? applyHeadingToSidePanelCameraFrame(
              sidePanelCameraFrame,
              getSidePanelHeadingQuaternion(
                object.getWorldQuaternion(new THREE.Quaternion()),
                upVector ?? new Vector3(0, 1, 0),
              ),
            )
          : sidePanelCameraFrame;

      const objectBox = new Box3().setFromObject(object);

      if (!objectBox.isEmpty()) {
<<<<<<< HEAD
        const expandedBox = expandBoundingBox(objectBox, 2.5);

        const expandedSize = expandedBox.getSize(new Vector3());
        const expandedCenter = expandedBox.getCenter(new Vector3());
        const boxGeometry = new THREE.BoxGeometry(
          expandedSize.x,
          expandedSize.y,
          expandedSize.z,
        );
        const helperMesh = new THREE.Mesh(boxGeometry);
        helperMesh.position.copy(expandedCenter);
        helperMesh.visible = false;
        scene.add(helperMesh);

        api.refresh(helperMesh).reset().fit();

        // Remove helper mesh after a short delay to ensure the bounds are updated
        setTimeout(() => {
          scene.remove(helperMesh);
          boxGeometry.dispose();
        }, 0);
=======
        fitToBox(expandBoundingBox(objectBox, 2.5), frame);
>>>>>>> main
      } else {
        fitBoundsWithSidePanelFrame(
          object,
          object.getWorldPosition(new Vector3()),
          false,
          frame,
        );
      }
    }
  });

  // Focus camera on cuboid creation location when user starts creating
  useAnnotationEventHandler("annotation:cuboidCreationStarted", (payload) => {
<<<<<<< HEAD
    const { position } = payload;

    const boxGeometry = new THREE.BoxGeometry(
      DEFAULT_CUBOID_CREATION_MARGIN,
      DEFAULT_CUBOID_CREATION_MARGIN,
      DEFAULT_CUBOID_CREATION_MARGIN,
    );
    const helperMesh = new THREE.Mesh(boxGeometry);
    helperMesh.position.set(position[0], position[1], position[2]);
    helperMesh.visible = false;
    scene.add(helperMesh);

    api.refresh(helperMesh).reset().fit();

    setTimeout(() => {
      scene.remove(helperMesh);
      boxGeometry.dispose();
    }, 0);
=======
    fitToCenteredBox(payload.position, DEFAULT_CUBOID_CREATION_MARGIN);
>>>>>>> main
  });

  useAnnotationEventHandler(
    "annotation:3dPolylineVertexSelected",
    (payload) => {
<<<<<<< HEAD
      const { position } = payload;
      const focusBoxSize = getVertexFocusBoxSize();

      const boxGeometry = new THREE.BoxGeometry(
        focusBoxSize,
        focusBoxSize,
        focusBoxSize,
      );
      const helperMesh = new THREE.Mesh(boxGeometry);
      helperMesh.position.set(position[0], position[1], position[2]);
      helperMesh.visible = false;
      scene.add(helperMesh);

      api.refresh(helperMesh).reset().fit();

      setTimeout(() => {
        scene.remove(helperMesh);
        boxGeometry.dispose();
      }, 0);
=======
      fitToCenteredBox(payload.position, getVertexFocusBoxSize());
>>>>>>> main
    },
  );

  return null;
};
