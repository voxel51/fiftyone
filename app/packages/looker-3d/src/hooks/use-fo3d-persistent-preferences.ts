import { useBrowserStorage } from "@fiftyone/state";
import { DEFAULT_SELECTED_CUBOID_CROP_MARGIN } from "../constants";
import {
  DEFAULT_RAYCAST_PRECISION,
  type Fo3dPointCloudSettings,
} from "../fo3d/context";

/**
 * Persists fo3d viewer preferences across sessions via browser storage.
 */
export const useFo3dPersistentPreferences = () => {
  const [autoRotate, setAutoRotate] = useBrowserStorage(
    "fo3dAutoRotate",
    false,
  );

  const [pointCloudSettings, setPointCloudSettings] =
    useBrowserStorage<Fo3dPointCloudSettings>("fo3d-pointCloudSettings", {
      enableTooltip: false,
      selectedCuboidCropMargin: DEFAULT_SELECTED_CUBOID_CROP_MARGIN,
    });

  const [raycastPrecision, setRaycastPrecision] = useBrowserStorage(
    "fo3d-raycastingPrecision",
    DEFAULT_RAYCAST_PRECISION,
  );

  return {
    autoRotate,
    setAutoRotate,
    pointCloudSettings,
    setPointCloudSettings,
    raycastPrecision,
    setRaycastPrecision,
  };
};
