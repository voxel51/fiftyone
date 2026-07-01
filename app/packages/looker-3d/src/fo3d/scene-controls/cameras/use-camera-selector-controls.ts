import { folder, useControls } from "leva";
import {
  createElement,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useSetRecoilState } from "recoil";
import { Vector3, type PerspectiveCamera } from "three";
import { PANEL_ORDER_CAMERAS } from "../../../constants";
import { useFetchSampleStaticTransform } from "../../../hooks/use-fetch-sample-static-transform";
import { cameraPositionAtom } from "../../../state";
import {
  getCameraControlsTarget,
  setCameraControlsLookAt,
  type Fo3dCameraControls,
} from "../../camera-controls";
import { customComponent } from "../LevaCustomComponent";
import { CameraAutocomplete } from "./CameraAutocomplete";
import {
  buildCameraControlOptionsFromTransforms,
  type CameraControlOption,
  resolveCameraSelectorTarget,
} from "./utils";

type UseCameraSelectorControlsParams = {
  cameraControlsRef?: React.RefObject<Fo3dCameraControls>;
  lookAt: Vector3 | null;
};

export const useCameraSelectorControls = ({
  cameraControlsRef,
  lookAt,
}: UseCameraSelectorControlsParams) => {
  const setCameraPosition = useSetRecoilState(cameraPositionAtom);
  const { fetchAvailableStaticTransforms } = useFetchSampleStaticTransform();

  const [cameraOptions, setCameraOptions] = useState<CameraControlOption[]>([]);
  const [selectedCameraKey, setSelectedCameraKey] = useState<string | null>(
    null,
  );

  // This effect fetches available static transforms and builds camera selector options
  useEffect(() => {
    let cancelled = false;

    const loadCameraOptions = async () => {
      const transforms = await fetchAvailableStaticTransforms();
      if (cancelled) {
        return;
      }

      setCameraOptions(buildCameraControlOptionsFromTransforms(transforms));
    };

    loadCameraOptions();

    return () => {
      cancelled = true;
    };
  }, [fetchAvailableStaticTransforms]);

  // This effect resets selection when it becomes stale (options changed and key no longer exists)
  useEffect(() => {
    if (selectedCameraKey === null) {
      return;
    }

    const stillValid = cameraOptions.some(
      (option) => option.key === selectedCameraKey,
    );
    if (!stillValid) {
      setSelectedCameraKey(null);
    }
  }, [cameraOptions, selectedCameraKey]);

  const applyCameraSelection = useCallback(
    (cameraKey: string) => {
      const selectedCamera = cameraOptions.find(
        (option) => option.key === cameraKey,
      );
      if (!selectedCamera) {
        return;
      }

      const translation = selectedCamera.translation;
      setCameraPosition(translation);

      if (cameraControlsRef?.current) {
        const fallbackTarget =
          lookAt || getCameraControlsTarget(cameraControlsRef.current);
        const target = resolveCameraSelectorTarget({
          translation,
          quaternion: selectedCamera.quaternion,
          fallbackTarget,
        });

        setCameraControlsLookAt({
          camera: cameraControlsRef.current.object as PerspectiveCamera,
          controls: cameraControlsRef.current,
          position: translation,
          target,
        });
      }
    },
    [cameraOptions, cameraControlsRef, lookAt, setCameraPosition],
  );

  const handleSelectCamera = useCallback(
    (cameraKey: string) => {
      setSelectedCameraKey(cameraKey);
      applyCameraSelection(cameraKey);
    },
    [applyCameraSelection],
  );

  const cameraSelectorControl = useMemo(
    () =>
      createElement(CameraAutocomplete, {
        options: cameraOptions,
        selectedCameraKey,
        onSelect: handleSelectCamera,
      }),
    [cameraOptions, handleSelectCamera, selectedCameraKey],
  );

  useControls(() => {
    if (cameraOptions.length === 0) {
      return {};
    }

    return {
      Cameras: folder(
        {
          Camera: customComponent({
            component: cameraSelectorControl,
          }),
        },
        {
          collapsed: false,
          order: PANEL_ORDER_CAMERAS,
        },
      ),
    };
  }, [cameraOptions, cameraSelectorControl]);
};
