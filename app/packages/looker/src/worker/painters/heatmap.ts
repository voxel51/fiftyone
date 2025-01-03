import { COLOR_BY, get32BitColor } from "@fiftyone/utilities";
import type { RGB } from "../..";
import { ARRAY_TYPES } from "../../numpy";
import type { HeatmapLabel } from "../../overlays/heatmap";
import type { Painter } from "./utils";
import {
  clampedIndex,
  getRgbFromMaskData,
  isFloatArray,
  requestColor,
} from "./utils";

const heatmap: Painter<HeatmapLabel> = async ({
  field,
  label,
  coloring,
  colorscale,
  customizeColorSetting,
}) => {
  if (!label?.map) {
    return;
  }

  const overlay = new Uint32Array(label.map.image);

  const mapData = label.map.data;

  const targets = new ARRAY_TYPES[label.map.data.arrayType](
    label.map.data.buffer
  );

  const [start, stop] = label.range
    ? label.range
    : isFloatArray(targets)
    ? [0, 1]
    : [0, 255];
  const max = Math.max(Math.abs(start), Math.abs(stop));

  let color: string;
  const fieldSetting = customizeColorSetting?.find((x) => field === x.path);

  // when colorscale is null or doe
  let scale: RGB[];

  if (colorscale?.fields?.find((x) => x.path === field)?.rgb) {
    scale = colorscale?.fields?.find((x) => x.path === field).rgb;
  } else if (colorscale?.default?.rgb) {
    scale = colorscale.default.rgb;
  } else {
    scale = coloring.scale;
  }

  // these for loops must be fast. no "in" or "of" syntax
  for (let i = 0; i < overlay.length; i++) {
    let value: number;
    if (mapData.channels > 2) {
      // rgb mask
      value = getRgbFromMaskData(targets, mapData.channels, i)[0];
    } else {
      value = Number(targets[i]);
    }

    // 0 is background image
    if (value === 0) {
      continue;
    }

    let r: number;
    if (coloring.by === COLOR_BY.FIELD) {
      color =
        fieldSetting?.fieldColor ??
        (await requestColor(coloring.pool, coloring.seed, field));

      r = get32BitColor(color, Math.min(max, Math.abs(value)) / max);
    } else {
      const index = clampedIndex(value, start, stop, scale.length);

      if (index < 0) {
        // values less than range start are background
        continue;
      }

      r = get32BitColor(scale[index]);
    }

    overlay[i] = r;
  }
};

export default heatmap;
