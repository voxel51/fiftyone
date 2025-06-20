import { Button, useTheme } from "@fiftyone/components";
import { RangeSlider } from "@fiftyone/core/src/components/Common/RangeSlider";
import { ColorscaleInput } from "@fiftyone/looker/src/state";
import type { Range } from "@fiftyone/state";
import * as fos from "@fiftyone/state";
import { FLOAT_FIELD, INT_FIELD } from "@fiftyone/utilities/src/constants";
import { folder, useControls } from "leva";
import type { OnChangeHandler } from "leva/plugin";
import { useCallback, useEffect, useMemo, useState } from "react";
import { atom, atomFamily, useRecoilState, useRecoilValue } from "recoil";
import { BufferGeometry } from "three";
import {
  DEFAULT_PCD_SHADING_GRADIENTS_RED_TO_BLUE,
  PANEL_ORDER_PCD_CONTROLS,
  SHADE_BY_CUSTOM,
  SHADE_BY_HEIGHT,
  SHADE_BY_INTENSITY,
  SHADE_BY_NONE,
  SHADE_BY_RGB,
} from "../constants";
import { useFo3dContext } from "../fo3d/context";
import { getMinMaxForAttribute } from "../fo3d/point-cloud/use-pcd-material";
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

const activeThresholdAtomFamily = atomFamily<Range, string>({
  key: "activeThreshold",
  default: [0, 1],
});

const boundsAtom = atom<Range>({
  key: "bounds",
  default: [0, 1],
});

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

  /**
   * lookup table for min and max values for each attribute
   */
  const thresholdsLut = useMemo(() => {
    const allAttributes = geometry.attributes;
    const attributeNames = Object.keys(allAttributes);
    const lut: Record<string, { min: number; max: number }> = {};

    for (const attributeName of attributeNames) {
      const [min, max] = getMinMaxForAttribute(geometry, attributeName);
      lut[attributeName] = { min, max };
    }

    return lut;
  }, [geometry]);

  const getSanitizedThreshold = useCallback(
    (min: number, max: number) => {
      const normalized = {
        min: Math.max(min, thresholdsLut[shadeBy]?.min ?? 0),
        max: Math.min(max, thresholdsLut[shadeBy]?.max ?? 1),
      };

      if (normalized.min > normalized.max) {
        return {
          min: thresholdsLut[shadeBy]?.min ?? 0,
          max: thresholdsLut[shadeBy]?.max ?? 1,
        };
      }

      return normalized;
    },
    [shadeBy, thresholdsLut]
  );

  const [bounds, setBounds] = useRecoilState(boundsAtom);

  useEffect(() => {
    const min = thresholdsLut[shadeBy]?.min;
    const max = thresholdsLut[shadeBy]?.max;

    const sanitized = getSanitizedThreshold(min, max);

    setBounds([sanitized.min, sanitized.max]);
  }, [thresholdsLut, shadeBy]);

  const isExplicitAppConfigColormapAvailable = useMemo(() => {
    if (colorScheme.colorscales && colorScheme.colorscales.length > 0) {
      const path = `::fo3d::pcd::${shadeBy}`;
      const colorScale = colorScheme.colorscales.find(
        (colorScale) => colorScale.path === path
      );
      return Boolean(colorScale?.name || colorScale?.list);
    }

    return false;
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
                  ...(prev ?? {}),
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
    shadeBy,
    colorMap.source,
    isExplicitAppConfigColormapAvailable,
    colormapOverride,
  ]);

  const theme = useTheme();

  const [activeThreshold, setActiveThreshold] = useRecoilState(
    activeThresholdAtomFamily(shadeBy)
  );

  useEffect(() => {
    const min = thresholdsLut[shadeBy]?.min ?? 0;
    const max = thresholdsLut[shadeBy]?.max ?? 1;

    setActiveThreshold([min, max]);
  }, [shadeBy, thresholdsLut]);

  const thresholdControl = useMemo(() => {
    const attribute = geometry.attributes[shadeBy];

    if (!attribute || !attribute.count) {
      return null;
    }

    const randomIndex = Math.floor(Math.random() * attribute.count);
    const randomValueFromGeometry = attribute.getX(randomIndex);
    const fieldType =
      randomValueFromGeometry !== undefined
        ? Number.isInteger(randomValueFromGeometry)
          ? INT_FIELD
          : FLOAT_FIELD
        : FLOAT_FIELD;

    return (
      <RangeSlider
        style={{ padding: "1em 0" }}
        alternateThumbLabelDirection={true}
        valueAtom={activeThresholdAtomFamily(shadeBy)}
        boundsAtom={boundsAtom}
        color={theme.primary.main}
        showBounds={true}
        fieldType={fieldType}
      />
    );
  }, [shadeBy, thresholdsLut, theme.primary.main, activeThresholdAtomFamily]);

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
          Thresholding: customComponent({
            component: thresholdControl,
            render: () => {
              return Boolean(
                shadeBy !== SHADE_BY_HEIGHT &&
                  shadeBy !== SHADE_BY_NONE &&
                  shadeBy !== SHADE_BY_RGB &&
                  !(
                    shadeBy === SHADE_BY_INTENSITY &&
                    !geometry.hasAttribute("intensity")
                  ) &&
                  shadeBy !== SHADE_BY_CUSTOM
              );
            },
          }),
          // todo: disabling opacity for now because rit's not working as intended
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
      thresholdsLut,
      isPointSizeAttenuated,
      colormapOverrideButton,
      thresholdControl,
      numPrimaryAssets,
      name,
      shadeModes,
    ]
  );

  return {
    activeThreshold,
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
