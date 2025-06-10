import { Button } from "@fiftyone/components";
import { ColorscaleInput } from "@fiftyone/looker/src/state";
import * as fos from "@fiftyone/state";
import { folder, useControls } from "leva";
import type { OnChangeHandler } from "leva/plugin";
import { useCallback, useMemo, useState } from "react";
import { useRecoilState, useRecoilValue } from "recoil";
import { BufferGeometry } from "three";
import {
  DEFAULT_PCD_SHADING_GRADIENTS_RED_TO_BLUE,
  PANEL_ORDER_PCD_CONTROLS,
  SHADE_BY_CUSTOM,
  SHADE_BY_HEIGHT,
  SHADE_BY_NONE,
} from "../constants";
import { useFo3dContext } from "../fo3d/context";
import { customComponent } from "../fo3d/scene-controls/LevaCustomComponent";
import { getGradientFromSchemeName } from "../renderables/pcd/shaders/gradientMap";
import { isColormapModalOpenAtom } from "../state";
import type { FoPointcloudMaterialProps } from "./use-fo3d";

const ColormapSource = {
  DEFAULT: "App Default",
  DATASET: "App Config (Explicit)",
  DATASET_DEFAULT: "App Config (Default)",
  OVERRIDE: "Custom Override",
} as const;

export const usePcdMaterialControls = (
  name: string,
  geometry: BufferGeometry,
  defaultMaterial: FoPointcloudMaterialProps
) => {
  const { numPrimaryAssets } = useFo3dContext();
  const [isColormapModalOpen, setIsColormapModalOpen] = useRecoilState(
    isColormapModalOpenAtom
  );

  const shadeModes = useMemo(() => {
    // list all attributes in the geometry
    const attributes = geometry.attributes;
    const attributeNames = Object.keys(attributes);

    // to support legacy intensity, we need to include "intensity" if "rgb" is present
    if (geometry.hasAttribute("rgb")) {
      attributeNames.push("intensity");
    }

    return [SHADE_BY_NONE, SHADE_BY_HEIGHT, SHADE_BY_CUSTOM].concat(
      Array.from(new Set(attributeNames))
        .sort()
        .filter((name) => name !== "position" && name !== "dynamicAttr")
    );
  }, [geometry]);

  const [shadeBy, setShadeBy] = fos.useBrowserStorage(
    "fo3dPcdShadingMode",
    defaultMaterial.shadingMode,
    false,
    {
      parse: (value) => {
        if (!shadeModes.includes(value)) {
          return SHADE_BY_HEIGHT;
        }

        return value;
      },
      stringify: (value) => value,
    }
  );
  const [customColor, setCustomColor] = useState(defaultMaterial.customColor);
  const [pointSize, setPointSize] = fos.useBrowserStorage(
    "fo3dPcdPointSize",
    defaultMaterial.pointSize
  );
  const [isPointSizeAttenuated, setIsPointSizeAttenuated] =
    fos.useBrowserStorage(
      "fo3dIsPointSizeAttenuated",
      defaultMaterial.attenuateByDistance
    );

  const [opacity, setOpacity] = useState(defaultMaterial.opacity);

  const colorScheme = useRecoilValue(fos.colorScheme);

  const [colormapOverride, setColormapOverride] = fos.useBrowserStorage<{
    [key: string]: ColorscaleInput["list"];
  } | null>("fo3dPcdColormapOverride", null, false, {
    parse: (value) => {
      try {
        return JSON.parse(value);
      } catch {
        return null;
      }
    },
    stringify: (value) => JSON.stringify(value),
  });

  const isExplicitAppConfigColormapAvailable = useMemo(() => {
    if (colorScheme.colorscales && colorScheme.colorscales.length > 0) {
      // find path
      const path = `::fo3d::pcd::${shadeBy}`;
      const colorScale = colorScheme.colorscales.find(
        (colorScale) => colorScale.path === path
      );
      return Boolean(colorScale?.name || colorScale?.list);
    }
  }, [colorScheme.colorscales, shadeBy]);

  const isDefaultAppConfigColormapAvailable = useMemo(() => {
    return Boolean(
      colorScheme.defaultColorscale?.name || colorScheme.defaultColorscale?.list
    );
  }, [colorScheme.defaultColorscale]);

  /**
   * The precedence order for determining the color map to use:
   *
   * 1. Color map from browser storage (colormapOverride)
   * 2. Color map from dataset app config (colorScheme.colorscales)
   * 3. Color map from default dataset app config (colorScheme.defaultColorscale)
   * 3. Fallback (red-to-blue gradient)
   */
  const colorMap = useMemo(() => {
    if (shadeBy === SHADE_BY_HEIGHT) {
      return {
        list: DEFAULT_PCD_SHADING_GRADIENTS_RED_TO_BLUE,
        source: ColormapSource.DEFAULT,
      };
    }

    if (colormapOverride && colormapOverride[shadeBy]) {
      return {
        list: colormapOverride?.[shadeBy] ?? null,
        source: ColormapSource.OVERRIDE,
      };
    }

    if (isExplicitAppConfigColormapAvailable) {
      const path = `::fo3d::pcd::${shadeBy}`;
      const colorScale = colorScheme.colorscales.find(
        (colorScale) => colorScale.path === path
      );

      // `list` is prioritized over `name`

      if (colorScale?.list?.length > 0) {
        return {
          list: colorScale.list as ColorscaleInput["list"],
          source: ColormapSource.DATASET,
        };
      } else if (colorScale?.name) {
        return {
          list: getGradientFromSchemeName(colorScale.name),
          source: ColormapSource.DATASET,
        };
      }
    }

    if (isDefaultAppConfigColormapAvailable) {
      const list = colorScheme.defaultColorscale?.list;
      if (list) {
        return {
          list,
          source: ColormapSource.DATASET_DEFAULT,
        };
      }

      return {
        list: getGradientFromSchemeName(colorScheme.defaultColorscale?.name),
        source: ColormapSource.DATASET_DEFAULT,
      };
    }

    return {
      list: DEFAULT_PCD_SHADING_GRADIENTS_RED_TO_BLUE,
      source: ColormapSource.DEFAULT,
    };
  }, [
    colormapOverride,
    colorScheme.colorscales,
    shadeBy,
    isExplicitAppConfigColormapAvailable,
    isDefaultAppConfigColormapAvailable,
  ]);

  const colormapOverrideButton = useMemo(() => {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <div style={{ fontSize: "1.1em", color: "#999" }}>
          Source: {colorMap.source}
        </div>
        <div style={{ display: "flex", gap: "8px", flexDirection: "column" }}>
          <Button
            style={{
              fontSize: "1em",
              boxShadow: "none",
            }}
            onClick={() => setIsColormapModalOpen(true)}
          >
            {colorMap.source === ColormapSource.OVERRIDE
              ? "Edit Override"
              : "Override"}
          </Button>
          {colormapOverride && colormapOverride[shadeBy] && (
            <Button
              style={{
                fontSize: "1em",
                boxShadow: "none",
              }}
              onClick={() =>
                setColormapOverride((prev) => ({
                  ...prev,
                  [shadeBy]: null,
                }))
              }
            >
              {isExplicitAppConfigColormapAvailable
                ? "Reset (App Config)"
                : "Reset (App Default)"}
            </Button>
          )}
        </div>
      </div>
    );
  }, [
    setIsColormapModalOpen,
    colorMap.source,
    isExplicitAppConfigColormapAvailable,
    colormapOverride,
  ]);

  const onChangeTextBox: OnChangeHandler = useCallback((newValue: number) => {
    setPointSize(newValue);
  }, []);

  const handleColormapSave = useCallback(
    (colorscaleList: ColorscaleInput["list"]) => {
      setColormapOverride({ [shadeBy]: colorscaleList });
      setIsColormapModalOpen(false);
    },
    [setColormapOverride, shadeBy]
  );

  useControls(
    () => ({
      [name]: folder(
        {
          pointSize: {
            value: pointSize ?? 1,
            min: 0.01,
            max: 50,
            step: 0.01,
            onChange: onChangeTextBox,
            label: "Points Size",
            order: -2,
          },
          shadeBy: {
            value: shadeBy ?? SHADE_BY_HEIGHT,
            options: shadeModes,
            label: "Shade By",
            onChange: setShadeBy,
            order: -1,
          },
          [`${name} color`]: {
            value: customColor || "#ffffff",
            label: "Custom Color",
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
            order: 0,
          },
          Colormap: customComponent({
            component: colormapOverrideButton,
            render: () => {
              return (
                shadeBy !== SHADE_BY_HEIGHT &&
                shadeBy !== SHADE_BY_NONE &&
                shadeBy !== SHADE_BY_CUSTOM
              );
            },
          }),

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
          // collapse only if there's more than one primary asset in the scene
          collapsed: numPrimaryAssets > 1,
        }
      ),
    }),
    [
      defaultMaterial,
      geometry,
      opacity,
      pointSize,
      shadeBy,
      customColor,
      onChangeTextBox,
      colormapOverride,
      isColormapModalOpen,
    ]
  );

  return {
    shadeBy,
    customColor,
    isPointSizeAttenuated,
    opacity,
    pointSize,
    colorMap: colorMap.list as Readonly<ColorscaleInput["list"]>,
    colorMapSource: colorMap.source,
    isColormapModalOpen,
    setIsColormapModalOpen,
    handleColormapSave,
  };
};
