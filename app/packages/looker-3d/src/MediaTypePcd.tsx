import { useTheme } from "@fiftyone/components";
import * as fop from "@fiftyone/plugins";
import * as fos from "@fiftyone/state";
import { Typography } from "@mui/material";
import type { OrbitControlsProps as OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import _ from "lodash";
import React, { useCallback, useEffect, useLayoutEffect, useMemo } from "react";
import { useRecoilState, useRecoilValue, useSetRecoilState } from "recoil";
import {
  type Box3,
  type Camera,
  Object3D,
  type PerspectiveCamera,
  Vector3,
  type Vector3Tuple,
} from "three";
import { Screenshot } from "./action-bar/Screenshot";
import { SET_EGO_VIEW_EVENT, SET_TOP_VIEW_EVENT } from "./constants";
import { Container } from "./containers";
import { CAMERA_POSITION_KEY, Environment } from "./Environment";
import { useHotkey } from "./hooks";
import { ThreeDLabels } from "./labels";
import { PointCloudMesh } from "./renderables";
import { type Looker3dSettings, defaultPluginSettings } from "./settings";
import {
  currentActionAtom,
  currentPointSizeAtom,
  customColorMapAtom,
  isGridOnAtom,
  isPointSizeAttenuatedAtom,
  shadeByAtom,
} from "./state";
import { toEulerFromDegreesArray } from "./utils";

type View = "pov" | "top";

const DEFAULT_GREEN = "#00ff00";
const CANVAS_WRAPPER_ID = "sample3d-canvas-wrapper";

/**
 * This component renders the legacy point_cloud media type.
 */
export const MediaTypePcdComponent = () => {
  const settings = fop.usePluginSettings<Looker3dSettings>(
    "3d",
    defaultPluginSettings
  );

  const cameraRef = React.useRef<Camera>();
  const controlsRef = React.useRef();
  const [pointCloudBounds, setPointCloudBounds] = React.useState<Box3>();

  const all3dSlices = useRecoilValue(fos.all3dSlices);

  const mediaField = useRecoilValue(fos.selectedMediaField(true));

  const sampleMap = useRecoilValue(fos.active3dSlicesToSampleMap);

  useLayoutEffect(() => {
    const canvas = document.getElementById(CANVAS_WRAPPER_ID);

    if (canvas) {
      canvas.querySelector("canvas")?.setAttribute("canvas-loaded", "true");
    }
  }, []);

  const shadeBy = useRecoilValue(shadeByAtom);
  const [customColorMap, setCustomColorMap] =
    useRecoilState(customColorMapAtom);
  const pointSize = useRecoilValue(currentPointSizeAtom);
  const isPointSizeAttenuated = useRecoilValue(isPointSizeAttenuatedAtom);
  const isPointcloudDataset = useRecoilValue(fos.mediaType) === "point_cloud";

  const upVectorNormalized = useMemo(
    () =>
      settings.defaultUp
        ? new Vector3(...settings.defaultUp).normalize()
        : new Vector3(0, 0, 1),
    [settings]
  );

  useEffect(() => {
    Object3D.DEFAULT_UP = upVectorNormalized.clone();
  }, [upVectorNormalized]);

  const topCameraPosition = useMemo(() => {
    if (!pointCloudBounds) {
      return [1, 1, 20];
    }

    const absMax = Math.max(
      pointCloudBounds.max?.x,
      pointCloudBounds.max?.y,
      pointCloudBounds.max?.z
    );

    // we want the camera to be along the up vector
    // the scaling factor determines by how much
    const scalingFactor = !Number.isNaN(absMax) ? absMax * 2 : 20;
    const upVectorScaled = upVectorNormalized.multiplyScalar(scalingFactor);
    return [upVectorScaled.x, upVectorScaled.y, upVectorScaled.z];
  }, [pointCloudBounds, upVectorNormalized]);

  const defaultCameraPosition = useMemo(() => {
    const lastSavedCameraPosition =
      window?.localStorage.getItem(CAMERA_POSITION_KEY);

    if (lastSavedCameraPosition?.length > 0) {
      return JSON.parse(lastSavedCameraPosition);
    }

    if (settings.defaultCameraPosition) {
      return [
        settings.defaultCameraPosition.x,
        settings.defaultCameraPosition.y,
        settings.defaultCameraPosition.z,
      ];
    }

    return topCameraPosition;
  }, [topCameraPosition, settings]);

  const onChangeView = useCallback(
    (view: View) => {
      const camera = cameraRef.current as PerspectiveCamera;
      const controls = controlsRef.current as OrbitControls & {
        target: Vector3;
      };

      if (camera && controls) {
        controls.target as Vector3;
        const origCamPos = camera.position.clone();
        const origTarget = controls.target.clone();

        controls.target.set(0, 0, 0);

        switch (view) {
          case "top":
            camera.position.set(
              topCameraPosition[0],
              topCameraPosition[1],
              topCameraPosition[2]
            );
            break;
          case "pov":
            // todo: account for non-z up here
            camera.position.set(0, -10, 1);
            break;
        }

        camera.updateProjectionMatrix();
        return !(
          origTarget.equals(controls.target) &&
          origCamPos.distanceTo(camera.position) < 1
        );
      }
    },
    [topCameraPosition]
  );

  fos.useEventHandler(window, SET_TOP_VIEW_EVENT, () => {
    onChangeView("top");
  });

  fos.useEventHandler(window, SET_EGO_VIEW_EVENT, () => {
    onChangeView("pov");
  });

  const pcRotationSetting = _.get(settings, "pointCloud.rotation", [0, 0, 0]);
  const minZ = _.get(settings, "pointCloud.minZ", null);

  const pcRotation = useMemo(
    () => toEulerFromDegreesArray(pcRotationSetting as Vector3Tuple),
    [pcRotationSetting]
  );

  const setCurrentAction = useSetRecoilState(currentActionAtom);

  useHotkey("KeyT", () => onChangeView("top"), [onChangeView], {
    useTransaction: false,
  });
  useHotkey("KeyE", () => onChangeView("pov"), [onChangeView], {
    useTransaction: false,
  });

  useEffect(() => {
    const currentCameraPosition = cameraRef.current?.position;

    if (
      !currentCameraPosition ||
      (currentCameraPosition.x === defaultCameraPosition[0] &&
        currentCameraPosition.y === defaultCameraPosition[1] &&
        currentCameraPosition.z === defaultCameraPosition[2])
    ) {
      return;
    }

    cameraRef.current.position.set(
      defaultCameraPosition[0],
      defaultCameraPosition[1],
      defaultCameraPosition[2]
    );
  }, [defaultCameraPosition]);

  useEffect(() => {
    if (isPointcloudDataset) {
      setCustomColorMap((prev) => {
        if (prev && Object.hasOwn(prev, "default")) {
          return prev;
        }
        return { ...(prev ?? {}), default: DEFAULT_GREEN };
      });
    } else {
      const newCustomColorMap = {};
      for (const slice of all3dSlices) {
        newCustomColorMap[slice] = DEFAULT_GREEN;
      }
      setCustomColorMap((prev) => ({ ...newCustomColorMap, ...(prev ?? {}) }));
    }
  }, [isPointcloudDataset, all3dSlices, setCustomColorMap]);

  const theme = useTheme();

  const isGridOn = useRecoilValue(isGridOnAtom);

  const filteredSamples = useMemo(
    () =>
      Object.entries(sampleMap)
        .map(([slice, sample]) => {
          let mediaUrlUnresolved: string;

          if (Array.isArray(sample.urls)) {
            const mediaFieldObj = sample.urls.find(
              (u) => u.field === mediaField
            );
            if (mediaFieldObj) {
              mediaUrlUnresolved = mediaFieldObj.url;
            } else {
              return null;
            }
          } else {
            mediaUrlUnresolved = sample.urls[mediaField];
          }

          if (!mediaUrlUnresolved) {
            return null;
          }

          const mediaUrl = fos.getSampleSrc(mediaUrlUnresolved);

          const customColor =
            customColorMap?.[isPointcloudDataset ? "default" : slice] ??
            "#00ff00";

          return (
            <PointCloudMesh
              key={slice}
              minZ={minZ}
              upVector={upVectorNormalized}
              shadeBy={shadeBy}
              customColor={customColor}
              pointSize={pointSize}
              src={mediaUrl}
              rotation={pcRotation}
              onLoad={(boundingBox) => {
                if (!pointCloudBounds) setPointCloudBounds(boundingBox);
              }}
              defaultShadingColor={theme.text.primary}
              isPointSizeAttenuated={isPointSizeAttenuated}
            />
          );
        })
        .filter((e) => e !== null),
    [
      sampleMap,
      mediaField,
      shadeBy,
      pointSize,
      pcRotation,
      minZ,
      theme,
      isPointSizeAttenuated,
      pointCloudBounds,
      customColorMap,
      isPointcloudDataset,
      upVectorNormalized,
    ]
  );

  if (filteredSamples.length === 0) {
    return (
      <Container style={{ padding: "2em" }}>
        <Typography>
          No point-cloud samples detected for media field "{mediaField}"
        </Typography>
      </Container>
    );
  }

  return (
    <>
      <Canvas id={CANVAS_WRAPPER_ID} onClick={() => setCurrentAction(null)}>
        <Screenshot />
        <Environment
          controlsRef={controlsRef}
          cameraRef={cameraRef}
          settings={settings}
          isGridOn={isGridOn}
          bounds={pointCloudBounds}
        />
        <ThreeDLabels sampleMap={sampleMap} />
        {filteredSamples}
      </Canvas>
    </>
  );
};
