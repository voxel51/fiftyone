import { LoadingDots } from "@fiftyone/components";
import { useOverlayPersistence } from "@fiftyone/core/src/components/Modal/Lighter/useOverlayPersistence";
import useCanAnnotate from "@fiftyone/core/src/components/Modal/Sidebar/Annotate/useCanAnnotate";
import {
  EventBus,
  lighterSceneAtom,
  MockRenderer2D,
  MockResourceLoader,
  Scene2D,
} from "@fiftyone/lighter";
import { usePluginSettings } from "@fiftyone/plugins";
import * as fos from "@fiftyone/state";
import { isInMultiPanelViewAtom, useBrowserStorage } from "@fiftyone/state";
import { CameraControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import CameraControlsImpl from "camera-controls";
import { useAtom, useAtomValue } from "jotai";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRecoilCallback, useRecoilValue, useSetRecoilState } from "recoil";
import styled from "styled-components";
import * as THREE from "three";
import { Vector3 } from "three";
import { StatusBar } from "../StatusBar";
import { MultiPanelView } from "../annotation/MultiPanelView";
import { AnnotationToolbar } from "../annotation/annotation-toolbar/AnnotationToolbar";
import { PcdColorMapTunnel } from "../components/PcdColormapModal";
import {
  DEFAULT_BOUNDING_BOX,
  DEFAULT_CAMERA_POSITION,
  SET_EGO_VIEW_EVENT,
  SET_TOP_VIEW_EVENT,
} from "../constants";
import { StatusBarRootContainer } from "../containers";
import { useFo3d, useHotkey, useTrackStatus } from "../hooks";
import { useFo3dBounds } from "../hooks/use-bounds";
import type { Looker3dSettings } from "../settings";
import {
  activeNodeAtom,
  annotationPlaneAtom,
  cameraPositionAtom,
  clearTransformStateSelector,
  currentHoveredPointAtom,
  isActivelySegmentingSelector,
  isCurrentlyTransformingAtom,
  isFo3dBackgroundOnAtom,
  isPolylineAnnotateActiveAtom,
  isSegmentingPointerDownAtom,
  selectedPolylineVertexAtom,
} from "../state";
import { HoverMetadata } from "../types";
import { Fo3dSceneContent } from "./Fo3dCanvas";
import HoverMetadataHUD from "./HoverMetadataHUD";
import { Fo3dSceneContext } from "./context";
import {
  getCameraPositionKey,
  getFo3dRoot,
  getMediaPathForFo3dSample,
  getOrthonormalAxis,
} from "./utils";

const CANVAS_WRAPPER_ID = "sample3d-canvas-wrapper";

const MainContainer = styled.main`
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
`;

const calculateCameraPositionForUpVector = (
  center: Vector3,
  size: Vector3,
  upVector: Vector3,
  distanceMultiplier: number = 2.5,
  viewType: "top" | "pov" = "pov"
): Vector3 => {
  const maxSize = Math.max(size.x, size.y, size.z);
  const distance = maxSize * distanceMultiplier;

  const upDir = upVector.clone().normalize();

  if (viewType === "top") {
    // camera positioned directly above/below along the up vector
    return center.clone().add(upDir.multiplyScalar(distance));
  }

  // pov view - camera positioned at a ~5-degree angle for more natural perspective
  const angle = Math.PI / 32;

  // division by arbitrary numbers to make the camera position more natural for "automotive-centered" ego view
  // note: this is not a perfect solution as it doesn't account for non-automotive scenes
  // but "ego" view is a special case more natural to automotive scenes
  // ideally we want three views, ego, top, and pov...
  // for now we have only ego/pov + top
  const verticalDist = Math.abs(Math.sin(angle) * distance) / 6;
  const horizontalDist = Math.abs(Math.cos(angle) * distance) / 15;

  // 1. choose a world-forward direction (Y up ideally, else X)
  let worldForward = new Vector3(0, 1, 0);
  if (Math.abs(upDir.dot(worldForward)) > 0.999) {
    worldForward.set(1, 0, 0);
  }
  // If Z is up, use -Y as world forward to ensure +X is on the right
  if (upDir.equals(new Vector3(0, 0, 1))) {
    worldForward.set(0, -1, 0);
  }
  // If Y is up, use Z as world forward to ensure +X is on the right
  else if (upDir.equals(new Vector3(0, 1, 0))) {
    worldForward.set(0, 0, 1);
  }
  // If X is up, use Y as world forward to ensure +Z is on the right (this is arbitrary)
  else if (upDir.equals(new Vector3(1, 0, 0))) {
    worldForward.set(0, 1, 0);
  }

  // 2. project that forward into the horizontal plane (perp. to upDir)
  const proj = worldForward
    .clone()
    .sub(upDir.clone().multiplyScalar(worldForward.dot(upDir)))
    .normalize();

  // 3. build camera position: center + up‐offset + horizontal‐offset
  return new Vector3(0, 0, 0)
    .add(upDir.multiplyScalar(verticalDist))
    .add(proj.multiplyScalar(horizontalDist));
};

export const MediaTypeFo3dComponent = () => {
  const sample = useRecoilValue(fos.fo3dSample);
  const mediaField = useRecoilValue(fos.selectedMediaField(true));
  const is2DSampleViewerVisible = useRecoilValue(fos.groupMediaIsMainVisible);
  const isGroup = useRecoilValue(fos.isGroup);
  const setIsInMultiPanelView = useSetRecoilState(isInMultiPanelViewAtom);

  const settings = usePluginSettings<Looker3dSettings>("3d");

  const mediaPath = useMemo(
    () => getMediaPathForFo3dSample(sample, mediaField),
    [mediaField, sample]
  );

  const mode = useAtomValue(fos.modalMode);

  const mediaUrl = useMemo(() => fos.getSampleSrc(mediaPath), [mediaPath]);

  const fo3dRoot = useMemo(() => getFo3dRoot(sample.sample.filepath), [sample]);

  const { foScene, isLoading: isParsingFo3d } = useFo3d(
    mediaUrl,
    sample.sample.filepath,
    fo3dRoot
  );

  const [isSceneInitialized, setSceneInitialized] = useState(false);

  const numPrimaryAssets = useMemo(() => {
    if (!foScene) return 0;
    return foScene.children?.length ?? 0;
  }, [foScene]);

  const [scene, setScene] = useAtom(lighterSceneAtom);

  // Hack: Setup a ghost lighter for human annotation needs
  // Todo: Remove this and abstract out event bus / annotaion system from Lighter
  useEffect(() => {
    if (mode !== "annotate") return;

    const mockRenderer = new MockRenderer2D();
    const eventBus = new EventBus();
    const mockResourceLoader = new MockResourceLoader();

    const newScene = new Scene2D({
      renderer: mockRenderer,
      eventBus,
      canvas: document.createElement("canvas"),
      resourceLoader: mockResourceLoader,
      options: {
        activePaths: [],
      },
    });

    setScene(newScene);

    return () => {
      newScene.destroy();
      setScene(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, fo3dRoot]);

  useOverlayPersistence(scene);

  useHotkey(
    "KeyB",
    ({ set }) => {
      set(isFo3dBackgroundOnAtom, (prev) => !prev);
    },
    []
  );

  const getDefaultUpVector = useCallback(() => {
    if (foScene?.cameraProps.up) {
      const mayBeUp = foScene.cameraProps.up;
      if (mayBeUp === "X") {
        return new Vector3(1, 0, 0);
      }
      if (mayBeUp === "Y") {
        return new Vector3(0, 1, 0);
      }
      if (mayBeUp === "Z") {
        return new Vector3(0, 0, 1);
      }
      if (mayBeUp === "-X") {
        return new Vector3(-1, 0, 0);
      }
      if (mayBeUp === "-Y") {
        return new Vector3(0, -1, 0);
      }
      if (mayBeUp === "-Z") {
        return new Vector3(0, 0, -1);
      }
    }

    if (settings.defaultUp) {
      const maybeOrthonormalAxis = getOrthonormalAxis(settings.defaultUp);

      if (maybeOrthonormalAxis) {
        return new Vector3(
          settings.defaultUp[0],
          settings.defaultUp[1],
          settings.defaultUp[2]
        );
      }
    }

    // default to y-up
    return new Vector3(0, 1, 0);
  }, [foScene]);

  const [upVector, setUpVectorVal] = fos.useBrowserStorage<Vector3>(
    "fo3d-up-vector",
    null,
    false,
    {
      parse: (upVectorStr) => {
        try {
          const [x, y, z] = JSON.parse(upVectorStr);
          return new Vector3(x, y, z);
        } catch (error) {
          return new Vector3(0, 1, 0);
        }
      },
      stringify: (upVector) =>
        upVector ? JSON.stringify(upVector.toArray()) : "null",
    }
  );

  // todo: reconcile with lookAt from foScene, too
  const [lookAt, setLookAt] = useState<Vector3 | null>(null);

  useEffect(() => {
    if (!foScene || upVector) {
      return;
    }

    setUpVectorVal(getDefaultUpVector());
  }, [foScene, upVector, getDefaultUpVector]);

  const containerRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera>();
  const cameraControlsRef = useRef<CameraControls>();
  const datasetName = useRecoilValue(fos.datasetName);
  const isActivelySegmenting = useRecoilValue(isActivelySegmentingSelector);
  const isSegmentingPointerDown = useRecoilValue(isSegmentingPointerDownAtom);
  const isCurrentlyTransforming = useRecoilValue(isCurrentlyTransformingAtom);

  const keyState = useRef({
    shiftRight: false,
    shiftLeft: false,
    controlRight: false,
    controlLeft: false,
  });

  const updateCameraControlsConfig = useCallback(() => {
    if (!cameraControlsRef.current) return;

    // Disable camera controls when transforming
    if (isSegmentingPointerDown || isCurrentlyTransforming) {
      cameraControlsRef.current.enabled = false;
      return;
    }

    // Re-enable camera controls when not transforming
    cameraControlsRef.current.enabled = true;

    if (keyState.current.shiftRight || keyState.current.shiftLeft) {
      cameraControlsRef.current.mouseButtons.left =
        CameraControlsImpl.ACTION.TRUCK;
    } else if (keyState.current.controlRight || keyState.current.controlLeft) {
      cameraControlsRef.current.mouseButtons.left =
        CameraControlsImpl.ACTION.DOLLY;
    } else {
      cameraControlsRef.current.mouseButtons.left =
        CameraControlsImpl.ACTION.ROTATE;
    }
  }, [keyState, isCurrentlyTransforming, isSegmentingPointerDown]);

  /**
   * This effect updates the camera controls config when the transforming state changes
   */
  useEffect(() => {
    updateCameraControlsConfig();
  }, [updateCameraControlsConfig]);

  fos.useEventHandler(document, "keydown", (e: KeyboardEvent) => {
    if (e.code === "ShiftRight") keyState.current.shiftRight = true;
    if (e.code === "ShiftLeft") keyState.current.shiftLeft = true;
    if (e.code === "ControlRight") keyState.current.controlRight = true;
    if (e.code === "ControlLeft") keyState.current.controlLeft = true;
    updateCameraControlsConfig();
  });

  fos.useEventHandler(document, "keyup", (e: KeyboardEvent) => {
    if (e.code === "ShiftRight") keyState.current.shiftRight = false;
    if (e.code === "ShiftLeft") keyState.current.shiftLeft = false;
    if (e.code === "ControlRight") keyState.current.controlRight = false;
    if (e.code === "ControlLeft") keyState.current.controlLeft = false;
    updateCameraControlsConfig();
  });

  const assetsGroupRef = useRef<THREE.Group>();

  const {
    boundingBox: sceneBoundingBox,
    recomputeBounds,
    isComputing: isComputingSceneBoundingBox,
  } = useFo3dBounds(assetsGroupRef);

  const effectiveSceneBoundingBox = sceneBoundingBox || DEFAULT_BOUNDING_BOX;

  useEffect(() => {
    if (sceneBoundingBox && !lookAt) {
      const center = effectiveSceneBoundingBox.getCenter(new Vector3());
      setLookAt(center);
    }
  }, [sceneBoundingBox, lookAt, effectiveSceneBoundingBox]);

  const topCameraPosition = useMemo(() => {
    if (
      !sceneBoundingBox ||
      Math.abs(effectiveSceneBoundingBox.max.x) === Number.POSITIVE_INFINITY
    ) {
      return DEFAULT_CAMERA_POSITION();
    }

    const center = effectiveSceneBoundingBox.getCenter(new Vector3());
    const size = effectiveSceneBoundingBox.getSize(new Vector3());

    return calculateCameraPositionForUpVector(
      center,
      size,
      upVector,
      2.5,
      "top"
    );
  }, [sceneBoundingBox, upVector, effectiveSceneBoundingBox]);

  const overriddenCameraPosition = useRecoilValue(cameraPositionAtom);

  const lastSavedCameraPosition = useMemo(() => {
    const lastSavedCameraPosition = window?.localStorage.getItem(
      getCameraPositionKey(datasetName)
    );

    return lastSavedCameraPosition ? JSON.parse(lastSavedCameraPosition) : null;
  }, [datasetName]);

  const getDefaultCameraPosition = useCallback(
    (ignoreLastSavedCameraPosition = false) => {
      /**
       * This is the order of precedence for the camera position:
       * 1. If the user has set a camera position via operator by writing to `cameraPositionAtom`, use that
       * 2. If the user has set a default camera position in the scene itself, use that
       * 3. If the user has set a default camera position in the plugin settings, use that
       * 4. If the user has set a default camera position in the browser storage, use that
       * 5. Compute a default camera position based on the bounding box of the scene
       * 6. Use an arbitrary default camera position
       */

      if (isParsingFo3d) {
        return DEFAULT_CAMERA_POSITION();
      }

      if (overriddenCameraPosition?.length === 3) {
        return new Vector3(
          overriddenCameraPosition[0],
          overriddenCameraPosition[1],
          overriddenCameraPosition[2]
        );
      }

      if (
        !ignoreLastSavedCameraPosition &&
        lastSavedCameraPosition &&
        lastSavedCameraPosition.length === 3
      ) {
        return new Vector3(
          lastSavedCameraPosition[0],
          lastSavedCameraPosition[1],
          lastSavedCameraPosition[2]
        );
      }

      const defaultCameraPosition = foScene?.cameraProps.position;

      if (defaultCameraPosition) {
        return new Vector3(
          defaultCameraPosition[0],
          defaultCameraPosition[1],
          defaultCameraPosition[2]
        );
      }

      if (settings.defaultCameraPosition) {
        return new Vector3(
          settings.defaultCameraPosition.x,
          settings.defaultCameraPosition.y,
          settings.defaultCameraPosition.z
        );
      }

      if (
        sceneBoundingBox &&
        Math.abs(effectiveSceneBoundingBox.max.x) !== Number.POSITIVE_INFINITY
      ) {
        const size = effectiveSceneBoundingBox.getSize(new Vector3());

        return calculateCameraPositionForUpVector(
          new Vector3(0, 0, 0),
          size,
          upVector,
          1.5,
          "pov"
        );
      }

      return DEFAULT_CAMERA_POSITION();
    },
    [
      settings,
      overriddenCameraPosition,
      isParsingFo3d,
      foScene,
      sceneBoundingBox,
      effectiveSceneBoundingBox,
      upVector,
      lastSavedCameraPosition,
    ]
  );

  const defaultCameraPositionComputed = useMemo(
    () => getDefaultCameraPosition(),
    [getDefaultCameraPosition]
  );

  const resetActiveNode = useRecoilCallback(
    ({ set }) =>
      (event: MouseEvent | null) => {
        // Don't handle right click since that might mean we're panning the camera
        if (event?.type === "contextmenu") {
          return;
        }

        if (isActivelySegmenting) {
          return;
        }

        set(activeNodeAtom, null);
        set(currentHoveredPointAtom, null);
        set(clearTransformStateSelector, null);
        set(selectedPolylineVertexAtom, null);
        set(isCurrentlyTransformingAtom, false);
        setAutoRotate(false);
      },
    [isActivelySegmenting]
  );

  useLayoutEffect(() => {
    const canvas = document.getElementById(CANVAS_WRAPPER_ID);

    if (canvas) {
      canvas.querySelector("canvas")?.setAttribute("canvas-loaded", "true");
    }
  }, [isSceneInitialized]);

  useEffect(() => {
    resetActiveNode(null);
  }, [isSceneInitialized, resetActiveNode]);

  const onChangeView = useCallback(
    (
      view: "pov" | "top",
      {
        useAnimation = true,
        ignoreLastSavedCameraPosition = false,
        isFirstTime = false,
      }: {
        useAnimation?: boolean;
        ignoreLastSavedCameraPosition?: boolean;
        isFirstTime?: boolean;
      } = {}
    ) => {
      if (
        !sceneBoundingBox ||
        !cameraRef.current ||
        !cameraControlsRef.current
      ) {
        return;
      }

      const defaultCameraPosition = getDefaultCameraPosition(
        ignoreLastSavedCameraPosition
      );

      let newCameraPosition = [
        defaultCameraPosition.x,
        defaultCameraPosition.y,
        defaultCameraPosition.z,
      ] as const;

      // note: for ego, we don't have look at at center of bounding box
      // this is for the "automotive-centered" ego view
      // and doesn't make too much sense for "ego view" of other scenes
      let newLookAt: [number, number, number] = [0, 0, 0];

      if (view === "top") {
        newCameraPosition = [
          topCameraPosition.x,
          topCameraPosition.y,
          topCameraPosition.z,
        ];

        // for top view, we have look at at center of bounding box
        const center = effectiveSceneBoundingBox.getCenter(new Vector3());

        newLookAt = [center.x, center.y, center.z] as const;
      }

      cameraControlsRef.current.setLookAt(
        ...newCameraPosition,
        ...newLookAt,
        useAnimation
      );

      if (isFirstTime) {
        setSceneInitialized(true);
      }
    },
    [
      sceneBoundingBox,
      effectiveSceneBoundingBox,
      topCameraPosition,
      getDefaultCameraPosition,
      setSceneInitialized,
    ]
  );

  fos.useEventHandler(window, SET_TOP_VIEW_EVENT, () => {
    onChangeView("top", {
      useAnimation: true,
      ignoreLastSavedCameraPosition: true,
    });
  });

  fos.useEventHandler(window, SET_EGO_VIEW_EVENT, () => {
    onChangeView("pov", {
      useAnimation: true,
      ignoreLastSavedCameraPosition: true,
    });
  });

  useHotkey(
    "KeyT",
    ({}) => {
      onChangeView("top", {
        useAnimation: true,
        ignoreLastSavedCameraPosition: true,
      });
    },
    [onChangeView]
  );

  useHotkey(
    "KeyE",
    ({}) => {
      onChangeView("pov", {
        useAnimation: true,
        ignoreLastSavedCameraPosition: true,
      });
    },
    [onChangeView]
  );

  // zoom to selected labels and use them as the new lookAt
  useHotkey(
    "KeyZ",
    async ({ snapshot }) => {
      const currentSelectedLabels = await snapshot.getPromise(
        fos.selectedLabels
      );

      if (currentSelectedLabels.length === 0) {
        return;
      }

      const labelBoundingBoxes: THREE.Box3[] = [];

      for (const selectedLabel of currentSelectedLabels) {
        const field = selectedLabel.field;
        const labelId = selectedLabel.labelId;

        const labelFieldData = sample.sample[field];

        let thisLabel = null;

        if (Array.isArray(labelFieldData)) {
          // if the field data is an array of labels
          thisLabel = labelFieldData.find(
            (l) => l._id === labelId || l.id === labelId
          );
        } else if (
          labelFieldData &&
          labelFieldData.detections &&
          Array.isArray(labelFieldData.detections)
        ) {
          // if the field data contains detections
          thisLabel = labelFieldData.detections.find(
            (l) => l._id === labelId || l.id === labelId
          );
        } else {
          // single label
          thisLabel = labelFieldData;
        }

        if (!thisLabel) {
          continue;
        }

        const thisLabelDimension = thisLabel.dimensions as [
          number,
          number,
          number
        ];
        const thisLabelLocation = thisLabel.location as [
          number,
          number,
          number
        ];

        const thisLabelBoundingBox = new THREE.Box3();
        thisLabelBoundingBox.setFromCenterAndSize(
          new THREE.Vector3(...thisLabelLocation),
          new THREE.Vector3(...thisLabelDimension)
        );

        labelBoundingBoxes.push(thisLabelBoundingBox);
      }

      const unionBoundingBox: THREE.Box3 = labelBoundingBoxes[0].clone();

      for (let i = 1; i < labelBoundingBoxes.length; i++) {
        unionBoundingBox.union(labelBoundingBoxes[i]);
      }

      // center = (min + max) / 2
      let unionBoundingBoxCenter = new Vector3();
      unionBoundingBoxCenter = unionBoundingBoxCenter
        .addVectors(unionBoundingBox.min, unionBoundingBox.max)
        .multiplyScalar(0.5);

      // size = max - min
      let unionBoundingBoxSize = new Vector3();
      unionBoundingBoxSize = unionBoundingBoxSize.subVectors(
        unionBoundingBox.max,
        unionBoundingBox.min
      );

      const newCameraPosition = calculateCameraPositionForUpVector(
        unionBoundingBoxCenter,
        unionBoundingBoxSize,
        upVector,
        2,
        "top"
      );

      await cameraControlsRef.current.setLookAt(
        newCameraPosition.x,
        newCameraPosition.y,
        newCameraPosition.z,
        unionBoundingBoxCenter.x,
        unionBoundingBoxCenter.y,
        unionBoundingBoxCenter.z,
        true
      );
    },
    [sample, upVector],
    {
      useTransaction: false,
    }
  );

  // this effect sets the appropriate lookAt and camera position
  // and marks the scene as initialized
  useEffect(() => {
    if (
      !cameraControlsRef.current ||
      !cameraRef.current ||
      isComputingSceneBoundingBox
    ) {
      return;
    }

    // restore camera position and target from localStorage if it exists
    const lastSavedCameraState = window?.localStorage.getItem(
      getCameraPositionKey(datasetName)
    );
    let restored = false;
    if (lastSavedCameraState) {
      try {
        const parsed = JSON.parse(lastSavedCameraState);
        if (
          parsed &&
          Array.isArray(parsed.position) &&
          parsed.position.length === 3 &&
          Array.isArray(parsed.target) &&
          parsed.target.length === 3
        ) {
          cameraControlsRef.current.setLookAt(
            parsed.position[0],
            parsed.position[1],
            parsed.position[2],
            parsed.target[0],
            parsed.target[1],
            parsed.target[2],
            false
          );
          setSceneInitialized(true);
          restored = true;
        }
      } catch {}
    }

    if (!restored) {
      if (foScene?.cameraProps.lookAt?.length === 3) {
        cameraControlsRef.current.setTarget(
          foScene.cameraProps.lookAt[0],
          foScene.cameraProps.lookAt[1],
          foScene.cameraProps.lookAt[2],
          false
        );
        setSceneInitialized(true);
        return;
      } else {
        onChangeView("top", {
          useAnimation: false,
          ignoreLastSavedCameraPosition: false,
          isFirstTime: true,
        });
        setSceneInitialized(true);
      }
    }
  }, [
    foScene,
    onChangeView,
    cameraControlsRef,
    cameraRef,
    isComputingSceneBoundingBox,
  ]);

  useTrackStatus();

  const setUpVector = useCallback((upVector: Vector3) => {
    setUpVectorVal(upVector);
  }, []);

  const [autoRotate, setAutoRotate] = useBrowserStorage(
    "fo3dAutoRotate",
    false
  );

  const [pointCloudSettings, setPointCloudSettings] = useBrowserStorage(
    "fo3d-pointCloudSettings",
    {
      enableTooltip: false,
      rayCastingSensitivity: "high",
    }
  );

  const [hoverMetadata, setHoverMetadata] = useState<HoverMetadata | null>(
    null
  );

  const isAnnotationPlaneEnabled = useRecoilValue(annotationPlaneAtom).enabled;
  const isPolylineAnnotateActive = useRecoilValue(isPolylineAnnotateActiveAtom);

  const canAnnotate = useCanAnnotate();

  const shouldRenderMultiPanelView = useMemo(
    () =>
      mode === "annotate" &&
      canAnnotate &&
      !(isGroup && is2DSampleViewerVisible) &&
      isSceneInitialized,
    [mode, isGroup, is2DSampleViewerVisible, isSceneInitialized, canAnnotate]
  );

  useEffect(() => {
    if (shouldRenderMultiPanelView) {
      recomputeBounds();
    }
  }, [shouldRenderMultiPanelView, isAnnotationPlaneEnabled, recomputeBounds]);

  useEffect(() => {
    setIsInMultiPanelView(shouldRenderMultiPanelView);
  }, [shouldRenderMultiPanelView]);

  if (isParsingFo3d) {
    return <LoadingDots />;
  }

  return (
    <Fo3dSceneContext.Provider
      value={{
        isSceneInitialized,
        numPrimaryAssets,
        upVector,
        setUpVector,
        isComputingSceneBoundingBox,
        fo3dRoot,
        sceneBoundingBox: effectiveSceneBoundingBox,
        lookAt,
        setLookAt,
        autoRotate,
        setAutoRotate,
        pointCloudSettings,
        setPointCloudSettings,
        hoverMetadata,
        setHoverMetadata,
        pluginSettings: settings,
      }}
    >
      {shouldRenderMultiPanelView ? (
        <MultiPanelView
          key={upVector ? upVector.toArray().join(",") : null}
          assetsGroupRef={assetsGroupRef}
          foScene={foScene}
          sample={sample}
          cameraRef={cameraRef}
          cameraControlsRef={cameraControlsRef}
          defaultCameraPosition={defaultCameraPositionComputed}
        />
      ) : (
        <MainContainer ref={containerRef}>
          <HoverMetadataHUD />
          <PcdColorMapTunnel.Out />
          <Canvas
            id={CANVAS_WRAPPER_ID}
            eventSource={containerRef}
            onPointerMissed={resetActiveNode}
            key={upVector ? upVector.toArray().join(",") : null}
          >
            <Fo3dSceneContent
              cameraPosition={defaultCameraPositionComputed}
              upVector={upVector}
              fov={foScene?.cameraProps.fov ?? 50}
              isGizmoHelperVisible={true}
              near={foScene?.cameraProps.near ?? 0.1}
              far={foScene?.cameraProps.far ?? 2500}
              aspect={foScene?.cameraProps.aspect ?? 1}
              autoRotate={autoRotate}
              cameraControlsRef={cameraControlsRef}
              foScene={foScene}
              isSceneInitialized={isSceneInitialized}
              sample={sample}
              pointCloudSettings={pointCloudSettings}
              assetsGroupRef={assetsGroupRef}
              cameraRef={cameraRef}
            />
          </Canvas>
          <StatusBarRootContainer>
            <StatusBar cameraRef={cameraRef} />
          </StatusBarRootContainer>
        </MainContainer>
      )}
      {mode === "annotate" && isPolylineAnnotateActive && <AnnotationToolbar />}
    </Fo3dSceneContext.Provider>
  );
};
