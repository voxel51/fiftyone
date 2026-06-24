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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRecoilValue } from "recoil";
import styled from "styled-components";
import * as THREE from "three";
import { Box3, Vector3 } from "three";
import {
  FO_USER_DATA,
  getPanelElementId,
  getSidePanelGridArea,
  PANEL_ID_SIDE_TOP,
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
  hoveredLabelAtom,
  mainPanelPanSyncIntentAtom,
  mainPanelZoomSyncIntentAtom,
  selectedLabelForAnnotationAtom,
} from "../state";
import type { SidePanelId, SidePanelViewType } from "../types";
import { expandBoundingBox, findObjectByUserData } from "../utils";
import {
  applyMainPanelPanSyncIntentToOrthographicCamera,
  applyMainPanelZoomSyncIntentToOrthographicCamera,
  captureSidePanelCameraSnapshot,
  deriveSidePanelCameraFrame,
  doesPointCloudCropFitCamera,
  restoreSidePanelCameraSnapshot,
  shouldApplyMainPanelPanSyncIntent,
  shouldApplyMainPanelZoomSyncIntent,
  type SidePanelCameraSnapshot,
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
      deriveSidePanelCameraFrame({
        sceneBoundingBox,
        target: lookAt ?? new Vector3(0, 0, 0),
        upVector: upVector ?? new Vector3(0, 1, 0),
        viewType: safeSelectValue,
      }),
    [safeSelectValue, upVector, lookAt, sceneBoundingBox]
  );

  const theme = useTheme();

  const cameraRef = useRef<THREE.OrthographicCamera>();

  // --- "Fit bounds" reset key mechanism ---
  //
  // We can't call drei's `useBounds()` API directly from here because it's
  // only available inside the R3F <Bounds> component tree. Instead, we use a
  // `fitBoundsKey` counter to coordinate two things:
  //
  // 1. Force-remount the R3F <View> (via its `key` prop) so the camera,
  //    controls, and scene are cleanly re-initialized for the new orientation.
  //
  // 2. Temporarily enable <Bounds observe={true}> so drei auto-fits the
  //    camera to the scene contents. We disable it after 750ms so the user
  //    can freely pan/zoom without Bounds fighting them.
  //
  // Increment `fitBoundsKey` whenever the camera should re-fit: view changes,
  // reset button clicks, etc.
  const [observe, setObserve] = useState(true);

  const [fitBoundsKey, setFitBoundsKey] = useState(0);
  const pointCloudCropFitKey = pointCloudCrop
    ? pointCloudCrop.source === "hover" ||
      pointCloudCrop.source === "raycast-hover"
      ? null
      : `${pointCloudCrop.source}-${pointCloudCrop.labelId}-${fitBoundsKey}`
    : null;

  useEffect(() => {
    setObserve(true);
    const timer = setTimeout(() => {
      setObserve(false);
    }, 750);

    return () => clearTimeout(timer);
  }, [fitBoundsKey]);

  // Update camera to look at the scene center and use correct up vector
  useEffect(() => {
    if (cameraRef.current) {
      cameraRef.current.position.copy(sidePanelCameraFrame.position);
      cameraRef.current.up.copy(sidePanelCameraFrame.up);
      cameraRef.current.lookAt(sidePanelCameraFrame.target);
      cameraRef.current.updateProjectionMatrix();
    }
  }, [sidePanelCameraFrame]);

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
            ref={cameraRef}
            position={sidePanelCameraFrame.position}
            up={sidePanelCameraFrame.up.toArray() as [number, number, number]}
          />
          <MapControls
            makeDefault
            screenSpacePanning
            zoomToCursor
            enableRotate={false}
            zoomSpeed={0.8}
          />
          <Bounds
            fit
            clip
            observe={pointCloudCrop ? false : observe}
            margin={1.25}
            maxDuration={0.001}
          >
            <BoundsSideEffectsComponent
              pointCloudCrop={pointCloudCrop}
              pointCloudCropFitKey={pointCloudCropFitKey}
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
                unfocusedLabelOpacity={SIDE_PANEL_UNFOCUSED_LABEL_OPACITY}
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
            backgroundColor: (theme as any).background.level3,
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

const DEFAULT_CUBOID_CREATION_MARGIN = 50;
const DEFAULT_POLYLINE_VERTEX_FOCUS_SIZE = 5;
const MIN_POLYLINE_VERTEX_FOCUS_SIZE = 1;
const MAX_POLYLINE_VERTEX_FOCUS_SIZE = 30;
const AUTO_EXPAND_FIT_INTERVAL_MS = 125;
const RAYCAST_HOVER_FIT_INTERVAL_MS = 125;
const RAYCAST_HOVER_CENTER_EPSILON_SQ = 1e-8;
const SIDE_PANEL_UNFOCUSED_LABEL_OPACITY = 0.08;

interface RaycastHoverFitSnapshot {
  center: THREE.Vector3;
  halfSize: THREE.Vector3;
}

const BoundsSideEffectsComponent = ({
  pointCloudCrop,
  pointCloudCropFitKey,
}: {
  pointCloudCrop?: PointCloudCrop | null;
  pointCloudCropFitKey: string | null;
}) => {
  const api = useBounds();

  const { camera, scene, invalidate } = useThree();
  const controls = useThree(
    (state) => state.controls as SidePanelControls | undefined
  );
  const hoveredLabel = useRecoilValue(hoveredLabelAtom);
  const selectedLabel = useRecoilValue(selectedLabelForAnnotationAtom);
  const mainPanelPanSyncIntent = useRecoilValue(mainPanelPanSyncIntentAtom);
  const mainPanelZoomSyncIntent = useRecoilValue(mainPanelZoomSyncIntentAtom);
  const pointCloudCropRef = useRef(pointCloudCrop);
  const lastAutoExpandFitAtRef = useRef(0);
  const lastRaycastHoverFitAtRef = useRef(0);
  const lastRaycastHoverFitRef = useRef<RaycastHoverFitSnapshot | null>(null);
  const lastHandledMainPanelPanSyncIntentRef = useRef<string | null>(null);
  const lastHandledMainPanelZoomSyncIntentRef = useRef<string | null>(null);
  const hoverFocusRef = useRef<{
    labelId: string;
    snapshot: SidePanelCameraSnapshot;
  } | null>(null);

  useEffect(() => {
    pointCloudCropRef.current = pointCloudCrop;
  }, [pointCloudCrop]);

  const fitToTemporaryMesh = useCallback(
    (helperMesh: THREE.Mesh, dispose: () => void) => {
      scene.add(helperMesh);
      api.refresh(helperMesh).reset().fit();

      setTimeout(() => {
        scene.remove(helperMesh);
        dispose();
      }, 0);
    },
    [api, scene]
  );

  const fitToPointCloudCrop = useCallback(
    (crop: PointCloudCrop) => {
      const helperMesh = createPointCloudCropHelperMesh(crop);
      fitToTemporaryMesh(helperMesh, () =>
        disposePointCloudCropHelperMesh(helperMesh)
      );
    },
    [fitToTemporaryMesh]
  );

  const fitToBox = useCallback(
    (box: THREE.Box3) => {
      const boxSize = box.getSize(new Vector3());
      const boxCenter = box.getCenter(new Vector3());
      const boxGeometry = new THREE.BoxGeometry(
        boxSize.x,
        boxSize.y,
        boxSize.z
      );
      const boxMaterial = new THREE.MeshBasicMaterial({ visible: false });
      const helperMesh = new THREE.Mesh(boxGeometry, boxMaterial);
      helperMesh.position.copy(boxCenter);
      helperMesh.visible = false;

      fitToTemporaryMesh(helperMesh, () => {
        boxGeometry.dispose();
        boxMaterial.dispose();
      });
    },
    [fitToTemporaryMesh]
  );

  const fitToCenteredBox = useCallback(
    (center: THREE.Vector3Tuple, size: number) => {
      fitToBox(
        new Box3().setFromCenterAndSize(
          new Vector3(...center),
          new Vector3(size, size, size)
        )
      );
    },
    [fitToBox]
  );

  const fitToExpandedObject = useCallback(
    (object: THREE.Object3D) => {
      const objectBox = new Box3().setFromObject(object);

      if (objectBox.isEmpty()) {
        api.refresh(object).reset().fit();
        return;
      }

      fitToBox(expandBoundingBox(objectBox, 2.5));
    },
    [api, fitToBox]
  );

  const restoreHoverFocus = useCallback(() => {
    const hoverFocus = hoverFocusRef.current;
    if (!hoverFocus) {
      return;
    }

    hoverFocusRef.current = null;

    if (selectedLabel?._id === hoverFocus.labelId) {
      return;
    }

    restoreSidePanelCameraSnapshot({
      camera,
      controls,
      snapshot: hoverFocus.snapshot,
      invalidate,
    });
  }, [camera, controls, invalidate, selectedLabel?._id]);

  useEffect(() => {
    const crop = pointCloudCropRef.current;
    if (!crop || !pointCloudCropFitKey) {
      return;
    }

    fitToPointCloudCrop(crop);
  }, [fitToPointCloudCrop, pointCloudCropFitKey]);

  useEffect(() => {
    const hoveredLabelId = hoveredLabel?.id;
    if (!hoveredLabelId) {
      restoreHoverFocus();
      return;
    }

    const existingHoverFocus = hoverFocusRef.current;
    if (existingHoverFocus?.labelId === hoveredLabelId) {
      return;
    }

    if (!existingHoverFocus) {
      hoverFocusRef.current = {
        labelId: hoveredLabelId,
        snapshot: captureSidePanelCameraSnapshot(camera, controls),
      };
    } else {
      hoverFocusRef.current = {
        ...existingHoverFocus,
        labelId: hoveredLabelId,
      };
    }

    const crop = pointCloudCropRef.current;
    if (crop?.source === "hover" && crop.labelId === hoveredLabelId) {
      fitToPointCloudCrop(crop);
      return;
    }

    const object = findObjectByUserData(
      scene,
      FO_USER_DATA.LABEL_ID,
      hoveredLabelId
    );
    if (object) {
      fitToExpandedObject(object);
    }
  }, [
    camera,
    controls,
    fitToExpandedObject,
    fitToPointCloudCrop,
    hoveredLabel?.id,
    restoreHoverFocus,
    scene,
  ]);

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
  }, [
    camera,
    fitToPointCloudCrop,
    pointCloudCrop?.center.x,
    pointCloudCrop?.center.y,
    pointCloudCrop?.center.z,
    pointCloudCrop?.halfSize.x,
    pointCloudCrop?.halfSize.y,
    pointCloudCrop?.halfSize.z,
    pointCloudCrop?.quaternion.x,
    pointCloudCrop?.quaternion.y,
    pointCloudCrop?.quaternion.z,
    pointCloudCrop?.quaternion.w,
    pointCloudCrop?.source,
  ]);

  useEffect(() => {
    const crop = pointCloudCropRef.current;
    if (!crop || crop.source !== "raycast-hover") {
      lastRaycastHoverFitAtRef.current = 0;
      lastRaycastHoverFitRef.current = null;
      return;
    }

    const lastFit = lastRaycastHoverFitRef.current;
    if (
      lastFit &&
      lastFit.center.distanceToSquared(crop.center) <=
        RAYCAST_HOVER_CENTER_EPSILON_SQ &&
      lastFit.halfSize.distanceToSquared(crop.halfSize) <=
        RAYCAST_HOVER_CENTER_EPSILON_SQ
    ) {
      return;
    }

    const now = Date.now();
    if (
      lastFit &&
      now - lastRaycastHoverFitAtRef.current < RAYCAST_HOVER_FIT_INTERVAL_MS
    ) {
      return;
    }

    lastRaycastHoverFitAtRef.current = now;
    lastRaycastHoverFitRef.current = {
      center: crop.center.clone(),
      halfSize: crop.halfSize.clone(),
    };
    fitToPointCloudCrop(crop);
  }, [
    fitToPointCloudCrop,
    pointCloudCrop?.center.x,
    pointCloudCrop?.center.y,
    pointCloudCrop?.center.z,
    pointCloudCrop?.halfSize.x,
    pointCloudCrop?.halfSize.y,
    pointCloudCrop?.halfSize.z,
    pointCloudCrop?.quaternion.x,
    pointCloudCrop?.quaternion.y,
    pointCloudCrop?.quaternion.z,
    pointCloudCrop?.quaternion.w,
    pointCloudCrop?.source,
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
      !shouldApplyMainPanelZoomSyncIntent({
        activeCrop: pointCloudCropRef.current,
        hasHoverFocus: Boolean(hoverFocusRef.current || hoveredLabel?.id),
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
  }, [camera, controls, hoveredLabel?.id, invalidate, mainPanelZoomSyncIntent]);

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
        hasHoverFocus: Boolean(hoverFocusRef.current || hoveredLabel?.id),
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
  }, [camera, controls, hoveredLabel?.id, invalidate, mainPanelPanSyncIntent]);

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
      MAX_POLYLINE_VERTEX_FOCUS_SIZE
    );
  };

  useAnnotationEventHandler("annotation:3dLabelSelected", (payload) => {
    const { label } = payload;
    const crop = pointCloudCropRef.current;

    if (crop?.labelId === label._id) {
      fitToPointCloudCrop(crop);
      return;
    }

    const object = findObjectByUserData(
      scene,
      FO_USER_DATA.LABEL_ID,
      label._id
    );

    if (object) {
      const objectBox = new Box3().setFromObject(object);

      if (!objectBox.isEmpty()) {
        fitToBox(expandBoundingBox(objectBox, 2.5));
      } else {
        api.refresh(object).reset().fit();
      }
    }
  });

  // Focus camera on cuboid creation location when user starts creating
  useAnnotationEventHandler("annotation:cuboidCreationStarted", (payload) => {
    fitToCenteredBox(payload.position, DEFAULT_CUBOID_CREATION_MARGIN);
  });

  useAnnotationEventHandler(
    "annotation:3dPolylineVertexSelected",
    (payload) => {
      fitToCenteredBox(payload.position, getVertexFocusBoxSize());
    }
  );

  return null;
};
