import { isValidColor } from "@fiftyone/looker/src/overlays/util";
import { CustomizeColor } from "@fiftyone/state";
import { Color, cssColorNames } from "./Color";
import { getPointIndex } from "./getPointIndex";
import { sortStringsAlphabetically } from "./sortStringsAlphabetically";

const maxLegendLineLength = 35;
const wordMatch = new RegExp(`.{1,${maxLegendLineLength}}(\\s|$)`, "g");
const charMatch = new RegExp(`.{1,${maxLegendLineLength}}`, "g");

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

  const hasSelection = Array.isArray(plotSelection) && plotSelection.length > 0;
  const selectionSet = hasSelection ? new Set(plotSelection) : null;

  const mappedColorscale = colorscale.map(([r, g, b], idx) => {
    const color = Color.fromCSSRGBValues(r, g, b);
    return [idx / (colorscale.length - 1), color.toCSSRGBString()];
  });

  return Object.entries(traces)
    .sort((a, b) => sortStringsAlphabetically(a[0], b[0]))
    .map(addLineBreaks)
    .map(([key, trace]) => {
      const color =
        getLabelColor(key, setting) ??
        getConvertedColor(getColor(key)) ??
        new Color(255, 165, 0);

      const x = new Array(trace.length);
      const y = new Array(trace.length);
      const ids = new Array(trace.length);
      const labelsForColors =
        isContinuous && !isUncolored ? new Array(trace.length) : null;

      const selectedpoints = [];

      for (let i = 0; i < trace.length; i++) {
        const { points, id, sample_id, label } = trace[i];
        x[i] = points[0];
        y[i] = points[1];
        ids[i] = id;

        if (labelsForColors) {
          labelsForColors[i] = label;
        }

        if (hasSelection && selectionSet) {
          if (selectionSet.has(id) || selectionSet.has(sample_id)) {
            selectedpoints.push(i);
          }
        }
      }

      return {
        x,
        y,
        ids,
        type: "scattergl",
        mode: "markers",
        marker: {
          autocolorscale: !isContinuous,
          colorscale: mappedColorscale,
          color: isCategorical
            ? color.toCSSRGBString()
            : isUncolored
            ? null
            : labelsForColors,
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
        selectedpoints: selectedpoints.length ? selectedpoints : null,
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

const addLineBreaks = ([key, trace]) => {
  // split the key into chunks of <maxLegendLineLength> characters or less, respecting word boundaries.
  // (\s|$) forces match termination on whitespace or the end of the string.
  // {1,35}(\s|$) will match up to 35 characters followed by a whitespace character,
  // then we can join the result on <br /> to get a line break.
  if (key && key.length > maxLegendLineLength) {
    let lines = key.match(wordMatch);

    // if there was no whitespace to split it on, brute force split it at <maxLegendLineLength> chars
    if (lines.length === 1) {
      lines = key.match(charMatch);
    }

    key = lines.join("<br />");
  }
  return [key, trace];
};

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
