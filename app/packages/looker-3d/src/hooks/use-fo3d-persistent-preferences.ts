import { useBrowserStorage } from "@fiftyone/state";
import { useCallback, useMemo, type SetStateAction } from "react";
import { DEFAULT_SELECTED_CUBOID_CROP_MARGIN } from "../constants";
import type { Fo3dPointCloudSettings } from "../fo3d/context";
import {
  DEFAULT_SPLAT_SETTINGS,
  type Fo3dSplatSettings,
  normalizeSplatSettings,
} from "../fo3d/splat/settings";

const DEFAULT_POINT_CLOUD_SETTINGS: Fo3dPointCloudSettings = {
  enableTooltip: false,
  selectedCuboidCropMargin: DEFAULT_SELECTED_CUBOID_CROP_MARGIN,
};

const normalizePointCloudSettings = (
  settings?: Partial<Fo3dPointCloudSettings> | null,
): Fo3dPointCloudSettings => ({
  ...DEFAULT_POINT_CLOUD_SETTINGS,
  ...(settings ?? {}),
});

/**
 * Persists fo3d viewer preferences across sessions via browser storage.
 */
export const useFo3dPersistentPreferences = () => {
  const [autoRotate, setAutoRotate] = useBrowserStorage(
    "fo3dAutoRotate",
    false,
  );

  const [storedPointCloudSettings, setStoredPointCloudSettings] =
    useBrowserStorage<Partial<Fo3dPointCloudSettings>>(
      "fo3d-pointCloudSettings",
      DEFAULT_POINT_CLOUD_SETTINGS,
    );

  const pointCloudSettings = useMemo(
    () => normalizePointCloudSettings(storedPointCloudSettings),
    [storedPointCloudSettings],
  );

  const setPointCloudSettings = useCallback(
    (value: SetStateAction<Fo3dPointCloudSettings>) => {
      setStoredPointCloudSettings((prev) => {
        const normalizedPrev = normalizePointCloudSettings(prev);
        const next =
          typeof value === "function" ? value(normalizedPrev) : value;

        return normalizePointCloudSettings(next);
      });
    },
    [setStoredPointCloudSettings],
  );

  const [storedSplatSettings, setStoredSplatSettings] = useBrowserStorage(
    "fo3d-splatSettings:v1",
    DEFAULT_SPLAT_SETTINGS,
  );
  const splatSettings = useMemo(
    () => normalizeSplatSettings(storedSplatSettings),
    [storedSplatSettings],
  );
  const setSplatSettings = useCallback(
    (value: SetStateAction<Fo3dSplatSettings>) => {
      setStoredSplatSettings((previous) => {
        const normalizedPrevious = normalizeSplatSettings(previous);
        const next =
          typeof value === "function" ? value(normalizedPrevious) : value;

        return normalizeSplatSettings(next);
      });
    },
    [setStoredSplatSettings],
  );

  return {
    autoRotate,
    setAutoRotate,
    pointCloudSettings,
    setPointCloudSettings,
    splatSettings,
    setSplatSettings,
  };
};
