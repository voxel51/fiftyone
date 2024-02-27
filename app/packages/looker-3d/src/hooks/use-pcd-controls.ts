import { folder, useControls } from "leva";
import { OnChangeHandler } from "leva/plugin";
import { useCallback, useMemo } from "react";
import { useRecoilState } from "recoil";
import {
  PANEL_ORDER_PCD_CONTROLS,
  SHADE_BY_CUSTOM,
  SHADE_BY_HEIGHT,
  SHADE_BY_INTENSITY,
  SHADE_BY_NONE,
  SHADE_BY_RGB,
} from "../constants";
import {
  currentPointSizeAtom,
  customColorMapAtom,
  isPointSizeAttenuatedAtom,
  shadeByAtom,
} from "../state";
import { FoPointcloudMaterialProps } from "./use-fo3d";

export const usePcdControls = (
  name: string,
  defaultMaterial: FoPointcloudMaterialProps,
  isNodeActive: boolean
) => {
  const [shadeBy, setShadeBy] = useRecoilState(shadeByAtom);
  // todo: might not be a good idea to keep this in local storage without a well-defined eviction strategy
  const [customColorMap, setCustomColorMap] =
    useRecoilState(customColorMapAtom);
  const [pointSize, setPointSize] = useRecoilState(currentPointSizeAtom);
  const [isPointSizeAttenuated, setIsPointSizeAttenuated] = useRecoilState(
    isPointSizeAttenuatedAtom
  );

  const pointSizeNum = useMemo(() => Number(pointSize), [pointSize]);

  const onChangeTextBox: OnChangeHandler = useCallback(
    (newValue: number, _props, options) => {
      if (options.initial) return;

      setPointSize(String(newValue));
    },
    []
  );

  const panelTitle = useMemo(() => `${name} Controls`, [name]);

  useControls(
    () => ({
      [panelTitle]: folder(
        {
          pointSize: {
            value: pointSizeNum,
            min: 0.1,
            max: 20,
            step: 0.1,
            onChange: onChangeTextBox,
            label: "Points Size",
            order: -2,
          },
          shadeBy: {
            value: shadeBy,
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
            value: customColorMap[name] || "#ffffff",
            label: `${name} color`,
            onChange: (newColor: string) => {
              setCustomColorMap((prev) => {
                if (!prev) return { [name]: newColor };
                return { ...prev, [name]: newColor };
              });
            },
            render: () => {
              if (shadeBy === SHADE_BY_CUSTOM) return true;
              return false;
            },
          },
          isPointSizeAttenuated: {
            value: isPointSizeAttenuated,
            onChange: setIsPointSizeAttenuated,
            label: "Attenuated",
            order: 1000,
          },
        },
        {
          order: PANEL_ORDER_PCD_CONTROLS,
          collapsed: true,
        }
      ),
    }),
    [pointSizeNum, shadeBy, onChangeTextBox, isNodeActive]
  );

  return {
    shadeBy,
    customColorMap,
    pointSize: pointSizeNum,
    isPointSizeAttenuated,
  };
};
