import { CameraControls } from "@react-three/drei";
import { folder, useControls } from "leva";
import {
  createElement,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useSetRecoilState } from "recoil";
import { Vector3 } from "three";
import { PANEL_ORDER_CAMERAS } from "../../../constants";
import { useFetchSampleStaticTransform } from "../../../hooks/use-fetch-sample-static-transform";
import { cameraPositionAtom } from "../../../state";
import { customComponent } from "../LevaCustomComponent";
import { CameraAutocomplete } from "./CameraAutocomplete";
import {
  buildCameraControlOptionsFromTransforms,
  type CameraControlOption,
} from "./utils";

type UseCameraSelectorControlsParams = {
  cameraControlsRef?: React.RefObject<CameraControls>;
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
    null
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
      (option) => option.key === selectedCameraKey
    );
    if (!stillValid) {
      setSelectedCameraKey(null);
    }
  }, [cameraOptions]);

  const applyCameraSelection = useCallback(
    (cameraKey: string) => {
      const selectedCamera = cameraOptions.find(
        (option) => option.key === cameraKey
      );
      if (!selectedCamera) {
        return;
      }

      const translation = selectedCamera.translation;
      setCameraPosition(translation);

      if (cameraControlsRef?.current) {
        const target =
          lookAt || cameraControlsRef.current.getTarget(new Vector3());
        cameraControlsRef.current.setLookAt(
          translation[0],
          translation[1],
          translation[2],
          target.x,
          target.y,
          target.z,
          true
        );
      }
    },
    [cameraOptions, cameraControlsRef, lookAt, setCameraPosition]
  );

  const handleSelectCamera = useCallback(
    (cameraKey: string) => {
      setSelectedCameraKey(cameraKey);
      applyCameraSelection(cameraKey);
    },
    [applyCameraSelection]
  );

  const cameraSelectorControl = useMemo(
    () =>
      createElement(CameraAutocomplete, {
        options: cameraOptions,
        selectedCameraKey,
        onSelect: handleSelectCamera,
      }),
    [cameraOptions, handleSelectCamera, selectedCameraKey]
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
        }
      ),
    };
  }, [cameraOptions, cameraSelectorControl]);
};
