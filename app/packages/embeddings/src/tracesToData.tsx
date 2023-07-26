import { isValidColor } from "@fiftyone/looker/src/overlays/util";
import { CustomizeColor } from "@fiftyone/state";
import { Color, cssColorNames } from "./Color";
import { getPointIndex } from "./getPointIndex";
import { sortStringsAlphabetically } from "./sortStringsAlphabetically";

export function tracesToData(
  traces,
  style,
  getColor,
  plotSelection,
  selectionStyle,
  colorscale,
  setting
) {
  const isCategorical = style === "categorical";
  const isContinuous = style === "continuous";
  const isUncolored = style === "uncolored";
  return Object.entries(traces)
    .sort((a, b) => sortStringsAlphabetically(a[0], b[0]))
    .map(([key, trace]) => {
      const selectedpoints = plotSelection?.length
        ? plotSelection
            .map((id) => getPointIndex(trace, id))
            .filter((p) => p !== null)
        : null;
      const color =
        getLabelColor(key, setting) ??
        getConvertedColor(getColor(key)) ??
        new Color(255, 165, 0);

      const mappedColorscale = colorscale.map(
        (c: [number, number, number], idx) => {
          const color = Color.fromCSSRGBValues(...c);
          return [idx / (colorscale.length - 1), color.toCSSRGBString()];
        }
      );

      return {
        x: trace.map((d) => d.points[0]),
        y: trace.map((d) => d.points[1]),
        ids: trace.map((d) => d.id),
        type: "scattergl",
        mode: "markers",
        marker: {
          autocolorscale: !isContinuous, // isCategorical || isUncolored,
          colorscale: mappedColorscale,
          color: isCategorical
            ? color.toCSSRGBString()
            : isUncolored
            ? null
            : trace.map((d) => d.label),
          size: 6,
          colorbar:
            isCategorical || isUncolored
              ? undefined
              : {
                  lenmode: "fraction",
                  x: 1,
                  y: 0.5,
                },
        },
        name: key,
        selectedpoints,
        selected: {
          marker: {
            opacity: 1,
            size: selectionStyle === "selected" ? 10 : 6,
            color: selectionStyle === "selected" ? "orange" : undefined,
          },
        },
        unselected: {
          marker: {
            opacity: 0.2,
          },
        },
      };
    });
}

const getLabelColor = (key: string, setting: CustomizeColor): Color | null => {
  if (!setting || !setting.valueColors) {
    return null;
  }

  const color = setting.valueColors.find((x) => x.value === key)?.color;
  return getConvertedColor(color);
};

// converts CSS color (hex, name, rgb) to Color object
const getConvertedColor = (
  color: string | [number, number, number]
): Color | null => {
  if (Array.isArray(color)) {
    return Color.fromCSSRGBValues(...color);
  }

  if (!isValidColor(color)) {
    return null;
  }

  if (color.startsWith("#")) {
    const c = hexToRgb(color);
    return Color.fromCSSRGBValues(c.r, c.g, c.b);
  }

  if (color.startsWith("rgb")) {
    const c = color.split("(")[1].split(")")[0].split(",");
    return Color.fromCSSRGBValues(
      parseInt(c[0]),
      parseInt(c[1]),
      parseInt(c[2])
    );
  }

  const idx = cssColorNames.name.map((x) => x.toLowerCase()).indexOf(color);
  if (idx > -1) {
    const c = hexToRgb(cssColorNames.hex[idx]);
    return Color.fromCSSRGBValues(c.r, c.g, c.b);
  }

  return null;
};

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
}
