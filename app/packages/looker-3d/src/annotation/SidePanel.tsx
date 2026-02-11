import { useAnnotationEventHandler } from "@fiftyone/annotation";
import { useTheme } from "@fiftyone/components";
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
import { useEffect, useMemo, useRef, useState } from "react";
import styled from "styled-components";
import * as THREE from "three";
import { Box3, Vector3 } from "three";
import {
  FO_USER_DATA,
  getPanelElementId,
  getSidePanelGridArea,
  VIEW_TYPE_BACK,
  VIEW_TYPE_BOTTOM,
  VIEW_TYPE_FRONT,
  VIEW_TYPE_LEFT,
  VIEW_TYPE_RIGHT,
  VIEW_TYPE_TOP,
} from "../constants";
import { FoSceneComponent } from "../fo3d/FoScene";
import { Gizmos } from "../fo3d/Gizmos";
import { Lights } from "../fo3d/scene-controls/lights/Lights";
import { FoScene } from "../hooks";
import { ThreeDLabels } from "../labels";
import { RaycastService } from "../services/RaycastService";
import type { SidePanelId, SidePanelViewType } from "../types";
import { expandBoundingBox } from "../utils";
import { AnnotationPlane } from "./AnnotationPlane";
import { CreateCuboidRenderer } from "./CreateCuboidRenderer";
import { Crosshair3D } from "./Crosshair3D";
import {
  encodeImageSliceView,
  ImageSlicePanel,
  isImageSliceView,
} from "./ImageSlicePanel";
import { SegmentPolylineRenderer } from "./SegmentPolylineRenderer";
import { useImageSlicesIfAvailable } from "./useImageSlicesIfAvailable";

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
 * Calculate camera position for different side panel views based on upVector and lookAt point
 */
const calculateCameraPositionForSidePanel = (
  sidePanelViewType: SidePanelViewType,
  upVector: Vector3,
  lookAt: Vector3,
  sceneBoundingBox: Box3 | null
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
  upVector: Vector3
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
  const { imageSlices, resolveUrlForImageSlice, isLoadingImageSlices } =
    useImageSlicesIfAvailable(sample);

  const gridArea = getSidePanelGridArea(panelId);

  const position = useMemo(
    () =>
      upVector && lookAt
        ? calculateCameraPositionForSidePanel(
            view,
            upVector,
            lookAt,
            sceneBoundingBox
          )
        : new Vector3(0, 10, 0),
    [view, upVector, lookAt, sceneBoundingBox]
  );

  const cameraUp = useMemo(
    () =>
      upVector
        ? calculateCameraUpForSidePanel(view, upVector)
        : new Vector3(0, 1, 0),
    [view, upVector]
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

  useEffect(() => {
    setObserve(true);
    const timer = setTimeout(() => {
      setObserve(false);
    }, 750);

    return () => clearTimeout(timer);
  }, [fitBoundsKey]);

  // Update camera to look at the scene center and use correct up vector
  useEffect(() => {
    if (cameraRef.current && lookAt && upVector) {
      cameraRef.current.position.copy(position);
      cameraRef.current.up.copy(cameraUp);
      cameraRef.current.lookAt(lookAt);
      cameraRef.current.updateProjectionMatrix();
    }
  }, [position, cameraUp, lookAt, upVector]);

  const showImageSlicePanel = isImageSliceView(view) && imageSlices.length > 0;

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
          key={`${panelId}-${view}-${fitBoundsKey}`}
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
            position={position}
            up={cameraUp.toArray() as [number, number, number]}
          />
          <MapControls
            makeDefault
            screenSpacePanning
            zoomToCursor
            enableRotate={false}
            zoomSpeed={0.8}
          />
          <Bounds fit clip observe={observe} margin={1.25} maxDuration={0.001}>
            <BoundsSideEffectsComponent />
            <Gizmos isGridVisible={false} isGizmoHelperVisible={false} />
            <group visible={isSceneInitialized}>
              <FoSceneComponent scene={foScene} />
            </group>
            {isSceneInitialized && (
              <ThreeDLabels
                sampleMap={{ fo3d: sample as any }}
                globalOpacity={0.5}
                isMainPanel={false}
              />
            )}
            <AnnotationPlane
              showTransformControls={false}
              panelType="side"
              viewType={
                view.toLowerCase() as
                  | "top"
                  | "bottom"
                  | "right"
                  | "left"
                  | "front"
                  | "back"
              }
            />
            <RaycastService panelId={panelId} />
            <SegmentPolylineRenderer ignoreEffects />
            <CreateCuboidRenderer ignoreEffects />
            <Crosshair3D panelId={panelId} />
          </Bounds>
          <Lights lights={foScene?.lights} />
        </View>
      )}
      <ViewSelectorWrapper>
        <Select
          value={
            // While slices are loading, use a safe cardinal view to avoid validation errors
            // The ImageSlicePanel component will validate once loading completes
            isLoadingImageSlices && isImageSliceView(view)
              ? VIEW_TYPE_LEFT
              : view
          }
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

function findByUserData(
  scene: THREE.Scene,
  key: typeof FO_USER_DATA[keyof typeof FO_USER_DATA],
  value: unknown
): THREE.Object3D | null {
  let result: THREE.Object3D | null = null;
  scene.traverse((o) => {
    if (o.userData?.[key] === value) {
      result = o as THREE.Object3D;
    }
  });
  return result;
}

const DEFAULT_CUBOID_CREATION_MARGIN = 50;

const BoundsSideEffectsComponent = () => {
  const api = useBounds();

  const { scene } = useThree();

  useAnnotationEventHandler("annotation:3dLabelSelected", (payload) => {
    const { label } = payload;

    const object = findByUserData(scene, FO_USER_DATA.LABEL_ID, label._id);

    if (object) {
      const objectBox = new Box3().setFromObject(object);

      if (!objectBox.isEmpty()) {
        const expandedBox = expandBoundingBox(objectBox, 2.5);

        const expandedSize = expandedBox.getSize(new Vector3());
        const expandedCenter = expandedBox.getCenter(new Vector3());
        const boxGeometry = new THREE.BoxGeometry(
          expandedSize.x,
          expandedSize.y,
          expandedSize.z
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
      } else {
        api.refresh(object).reset().fit();
      }
    }
  });

  // Focus camera on cuboid creation location when user starts creating
  useAnnotationEventHandler("annotation:cuboidCreationStarted", (payload) => {
    const { position } = payload;

    const boxGeometry = new THREE.BoxGeometry(
      DEFAULT_CUBOID_CREATION_MARGIN,
      DEFAULT_CUBOID_CREATION_MARGIN,
      DEFAULT_CUBOID_CREATION_MARGIN
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
  });

  return null;
};
