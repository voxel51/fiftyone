import { folder, useControls } from "leva";
import type { OnChangeHandler } from "leva/plugin";
import { useCallback, useState } from "react";
import {
  PANEL_ORDER_PCD_CONTROLS,
  SHADE_BY_CUSTOM,
  SHADE_BY_HEIGHT,
  SHADE_BY_INTENSITY,
  SHADE_BY_NONE,
  SHADE_BY_RGB,
} from "../constants";
import type { FoPointcloudMaterialProps } from "./use-fo3d";
import { useBrowserStorage } from "@fiftyone/state";

export const usePcdMaterialControls = (
  name: string,
  defaultMaterial: FoPointcloudMaterialProps
) => {
  const [shadeBy, setShadeBy] = useBrowserStorage(
    "fo3dPcdShadingMode",
    defaultMaterial.shadingMode
  );
  const [customColor, setCustomColor] = useState(defaultMaterial.customColor);
  const [pointSize, setPointSize] = useBrowserStorage(
    "fo3dPcdPointSize",
    defaultMaterial.pointSize
  );
  const [isPointSizeAttenuated, setIsPointSizeAttenuated] = useBrowserStorage(
    "fo3dIsPointSizeAttenuated",
    defaultMaterial.attenuateByDistance
  );
  const [opacity, setOpacity] = useState(defaultMaterial.opacity);

  const onChangeTextBox: OnChangeHandler = useCallback((newValue: number) => {
    setPointSize(newValue);
  }, []);

  useControls(
    () => ({
      [name]: folder(
        {
          pointSize: {
            value: pointSize ?? 1,
            min: 0.01,
            // max point size is arbitrary. ideally, we should also offer a text box for users to input their desired point size
            max: 50,
            step: 0.01,
            onChange: onChangeTextBox,
            label: "Points Size",
            order: -2,
          },
          shadeBy: {
            value: shadeBy ?? SHADE_BY_HEIGHT,
            options: [
              SHADE_BY_NONE,
              SHADE_BY_HEIGHT,
              SHADE_BY_INTENSITY,
              SHADE_BY_RGB,
              SHADE_BY_CUSTOM,
            ],
            label: "Shade By",
            onChange: setShadeBy,
            order: -1,
          },
          [`${name} color`]: {
            value: customColor || "#ffffff",
            label: `${name} color`,
            onChange: (newColor: string) => {
              setCustomColor(newColor);
            },
            render: () => {
              if (shadeBy === SHADE_BY_CUSTOM) return true;
              return false;
            },
          },
          isPointSizeAttenuated: {
            value: isPointSizeAttenuated ?? false,
            onChange: setIsPointSizeAttenuated,
            label: "Attenuated",
            order: 1000,
          },
          // todo: disabling opacity for now because it's not working as intended
          // todo: shader logic is not trivial
          // opacity: {
          //   value: opacity,
          //   min: 0,
          //   max: 1,
          //   step: 0.01,
          //   onChange: setOpacity,
          //   label: "Opacity",
          //   order: 1001,
          // },
        },
        {
          order: PANEL_ORDER_PCD_CONTROLS,
          collapsed: true,
        }
      ),
    }),
    [defaultMaterial, opacity, pointSize, shadeBy, customColor, onChangeTextBox]
  );

  return {
    shadeBy,
    customColor,
    isPointSizeAttenuated,
    opacity,
    pointSize,
  };
};
