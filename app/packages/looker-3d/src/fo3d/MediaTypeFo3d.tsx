import { LoadingDots } from "@fiftyone/components";
import useCanAnnotate from "@fiftyone/core/src/components/Modal/Sidebar/Annotate/useCanAnnotate";
import { usePluginSettings } from "@fiftyone/plugins";
import * as fos from "@fiftyone/state";
import type { CameraControls } from "@react-three/drei";
import { useReducer, useRef } from "react";
import { useRecoilValue } from "recoil";
import type * as THREE from "three";
import { MultiPanelView } from "../annotation/MultiPanelView";
import { SinglePanelView } from "../annotation/SinglePanelView";
import { AnnotationToolbar } from "../annotation/annotation-toolbar/AnnotationToolbar";
import { ANNOTATION_CUBOID, ANNOTATION_POLYLINE } from "../constants";
import {
  useFo3d,
  useFo3dCameraControlsConfig,
  useFo3dCameraInitialization,
  useFo3dCameraViewEvents,
  useFo3dInteractionLifecycle,
  useFo3dPanelRouting,
  useFo3dSceneBounds,
  useFo3dSceneContextState,
  useTrackStatus,
} from "../hooks";
import type { Looker3dSettings } from "../settings";
import { useCurrent3dAnnotationMode } from "../state/accessors";
import { Annotation3d } from "./Annotation3d";
import {
  FO3D_CAMERA_LIFECYCLE,
  type Fo3dCameraLifecycleState,
  fo3dCameraLifecycleReducer,
} from "./camera-lifecycle";
import { Fo3dSceneContext } from "./context";
import { FoScene } from "./render-types";

interface Fo3dPanelsProps {
  shouldRenderMultiPanelView: boolean;
  upVector: THREE.Vector3 | null;
  assetsGroupRef: React.RefObject<THREE.Group>;
  foScene: FoScene | null;
  sample: fos.ModalSample;
  cameraRef: React.RefObject<THREE.PerspectiveCamera>;
  cameraControlsRef: React.RefObject<CameraControls>;
  mountCameraPosition: THREE.Vector3;
  cameraLifecycleState: Fo3dCameraLifecycleState;
  mode: string;
}

const Fo3dPanels = ({
  shouldRenderMultiPanelView,
  upVector,
  assetsGroupRef,
  foScene,
  sample,
  cameraRef,
  cameraControlsRef,
  mountCameraPosition,
  cameraLifecycleState,
  mode,
}: Fo3dPanelsProps) => {
  const { resetActiveNode } = useFo3dInteractionLifecycle({
    cameraLifecycleState,
    sample,
    upVector,
    mode,
    cameraControlsRef,
  });

  if (shouldRenderMultiPanelView) {
    return (
      <MultiPanelView
        key={upVector ? upVector.toArray().join(",") : null}
        assetsGroupRef={assetsGroupRef}
        foScene={foScene}
        sample={sample}
        cameraRef={cameraRef}
        cameraControlsRef={cameraControlsRef}
        defaultCameraPosition={mountCameraPosition}
        onPointerMissed={resetActiveNode}
      />
    );
  }

  return (
    <SinglePanelView
      assetsGroupRef={assetsGroupRef}
      foScene={foScene}
      sample={sample}
      cameraRef={cameraRef}
      cameraControlsRef={cameraControlsRef}
      defaultCameraPosition={mountCameraPosition}
      onPointerMissed={resetActiveNode}
    />
  );
};

export const MediaTypeFo3dComponent = () => {
  const sample = useRecoilValue(fos.fo3dSample);
  const settings = usePluginSettings<Looker3dSettings>("3d");
  const mode = fos.useModalMode();
  const canAnnotate = useCanAnnotate().showAnnotationTab;
  const current3dAnnotationMode = useCurrent3dAnnotationMode();

  const {
    foScene,
    isLoading: isParsingFo3d,
    fo3dRoot,
    rootAssetCount,
  } = useFo3d(sample);

  const [cameraLifecycleState, dispatchCameraLifecycle] = useReducer(
    fo3dCameraLifecycleReducer,
    FO3D_CAMERA_LIFECYCLE.WAITING_FOR_SCENE
  );

  const cameraRef = useRef<THREE.PerspectiveCamera>();
  const cameraControlsRef = useRef<CameraControls>();
  const assetsGroupRef = useRef<THREE.Group>();
  const threeJsLoadingStatus = useTrackStatus();

  useFo3dCameraControlsConfig({
    cameraControlsRef,
  });

  const {
    sceneBoundingBox,
    recomputeBounds,
    isComputingSceneBoundingBox,
    isBoundsResolved,
  } = useFo3dSceneBounds({
    assetsGroupRef,
    foScene,
    isParsingFo3d,
    rootAssetCount,
    isThreeJsLoadingSuccess: threeJsLoadingStatus.isSuccess,
  });

  const { upVector, effectiveSceneBoundingBox, contextValue } =
    useFo3dSceneContextState({
      foScene,
      settings,
      sceneBoundingBox,
      isComputingSceneBoundingBox,
      rootAssetCount,
      fo3dRoot,
      cameraLifecycleState,
    });

  const { shouldRenderMultiPanelView, currentRenderPath } = useFo3dPanelRouting(
    {
      mode,
      canAnnotate,
      cameraLifecycleState,
      recomputeBounds,
    }
  );

  const { mountCameraPosition } = useFo3dCameraInitialization({
    cameraRef,
    cameraControlsRef,
    currentRenderPath,
    foScene,
    sceneBoundingBox,
    upVector,
    settings,
    isBoundsResolved,
    dispatchCameraLifecycle,
  });

  useFo3dCameraViewEvents({
    cameraRef,
    cameraControlsRef,
    effectiveSceneBoundingBox,
    sceneBoundingBox,
    upVector,
    foScene,
    settings,
    recomputeBounds,
  });

  const isPolylineAnnotateActive =
    current3dAnnotationMode === ANNOTATION_POLYLINE;
  const isCuboidAnnotateActive = current3dAnnotationMode === ANNOTATION_CUBOID;
  const shouldShowAnnotationToolbar =
    mode === fos.ModalMode.ANNOTATE &&
    (isPolylineAnnotateActive || isCuboidAnnotateActive);

  if (isParsingFo3d) {
    return <LoadingDots />;
  }

  return (
    <Fo3dSceneContext.Provider value={contextValue}>
      {canAnnotate && <Annotation3d />}
      <Fo3dPanels
        shouldRenderMultiPanelView={shouldRenderMultiPanelView}
        upVector={upVector}
        assetsGroupRef={assetsGroupRef}
        foScene={foScene}
        sample={sample}
        cameraRef={cameraRef}
        cameraControlsRef={cameraControlsRef}
        mountCameraPosition={mountCameraPosition}
        cameraLifecycleState={cameraLifecycleState}
        mode={mode}
      />
      {shouldShowAnnotationToolbar && <AnnotationToolbar />}
    </Fo3dSceneContext.Provider>
  );
};
