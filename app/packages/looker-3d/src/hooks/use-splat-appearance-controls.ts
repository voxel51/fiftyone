import { useControls } from "leva";
import { useEffect, useState } from "react";
import { PANEL_ORDER_PCD_CONTROLS } from "../constants";
import {
  MAX_SPLAT_SHARPNESS,
  MIN_SPLAT_SHARPNESS,
  SPLAT_DETAIL_OPTIONS,
  SPLAT_SH_OPTIONS,
  SPLAT_SORTING_OPTIONS,
  type SplatDetail,
  type SplatShDegree,
  type SplatSorting,
} from "../fo3d/splat/settings";
import { useSplatSettings } from "./use-splat-settings";

interface SplatAppearanceControls {
  assetKey: string;
  defaultOpacity: number;
  defaultTint: string;
  name: string;
}

/** Provides splat controls in the asset's 3D settings folder. */
export const useSplatAppearanceControls = ({
  assetKey,
  defaultOpacity,
  defaultTint,
  name,
}: SplatAppearanceControls) => {
  const [splatSettings, setSplatSettings] = useSplatSettings();
  const { detail, maxSh, sharpness, sorting } = splatSettings;
  const [opacity, setOpacity] = useState(defaultOpacity);
  const [tint, setTint] = useState(defaultTint);

  const [, setControls] = useControls(
    name,
    () => ({
      splatTypeLabel: {
        value: "Gaussian Splat",
        label: "Type",
        editable: false,
        order: -1,
      },
      opacity: {
        value: defaultOpacity,
        min: 0,
        max: 1,
        step: 0.05,
        onChange: setOpacity,
        label: "Opacity",
        order: 1000,
      },
      tint: {
        value: defaultTint,
        onChange: setTint,
        label: "Tint",
        order: 1001,
      },
      detail: {
        value: detail,
        label: "Detail",
        options: SPLAT_DETAIL_OPTIONS,
        onChange: (value: SplatDetail) => {
          setSplatSettings((previous) => ({ ...previous, detail: value }));
        },
        order: 1002,
      },
      sharpness: {
        value: sharpness,
        label: "Sharpness",
        min: MIN_SPLAT_SHARPNESS,
        max: MAX_SPLAT_SHARPNESS,
        step: 0.1,
        onChange: (value: number) => {
          setSplatSettings((previous) => ({
            ...previous,
            sharpness: value,
          }));
        },
        order: 1003,
      },
      sorting: {
        value: sorting,
        label: "Sorting",
        options: SPLAT_SORTING_OPTIONS,
        onChange: (value: SplatSorting) => {
          setSplatSettings((previous) => ({ ...previous, sorting: value }));
        },
        order: 1004,
      },
      maxSh: {
        value: maxSh,
        label: "View-dependent color",
        options: SPLAT_SH_OPTIONS,
        onChange: (value: SplatShDegree) => {
          setSplatSettings((previous) => ({ ...previous, maxSh: value }));
        },
        order: 1005,
      },
    }),
    {
      order: PANEL_ORDER_PCD_CONTROLS,
      collapsed: true,
    },
    [name, setSplatSettings],
  );

  // This effect resets values when the component is reused for a new asset,
  // without rebuilding the entire Leva schema during a drag.
  useEffect(() => {
    setOpacity(defaultOpacity);
    setTint(defaultTint);
    setControls({ opacity: defaultOpacity, tint: defaultTint });
  }, [assetKey, defaultOpacity, defaultTint, setControls]);

  // This effect keeps Leva synchronized when browser-persisted settings
  // hydrate or change outside this control instance.
  useEffect(() => {
    setControls({ detail, maxSh, sharpness, sorting });
  }, [detail, maxSh, setControls, sharpness, sorting]);

  return { opacity, tint };
};
