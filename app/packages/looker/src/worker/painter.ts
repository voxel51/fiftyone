import { COLOR_BY, get32BitColor, rgbToHexCached } from "@fiftyone/utilities";
import colorString from "color-string";
import { ARRAY_TYPES, OverlayMask, TypedArray } from "../numpy";
import {
  getHashLabel,
  isRgbMaskTargets,
  shouldShowLabelTag,
} from "../overlays/util";
import {
  Coloring,
  CustomizeColor,
  LabelTagColor,
  MaskColorInput,
  MaskTargets,
  RgbMaskTargets,
} from "../state";

export const PainterFactory = (requestColor) => ({
  Detection: async (
    field,
    label,
    coloring: Coloring,
    customizeColorSetting: CustomizeColor[],
    labelTagColors: LabelTagColor,
    selectedLabelTags: string[]
  ) => {
    if (!label.mask) {
      return;
    }

    const setting = customizeColorSetting?.find((s) => s.path === field);
    let color;

    const isTagged = shouldShowLabelTag(selectedLabelTags, label.tags);
    if (coloring.by === COLOR_BY.INSTANCE) {
      color = await requestColor(
        coloring.pool,
        coloring.seed,
        getHashLabel(label)
      );
    }
    if (coloring.by === COLOR_BY.FIELD) {
      if (isTagged) {
        if (
          labelTagColors.fieldColor &&
          Boolean(colorString.get(labelTagColors.fieldColor))
        ) {
          color = labelTagColors.fieldColor;
        } else {
          color = await requestColor(
            coloring.pool,
            coloring.seed,
            "_label_tags"
          );
        }
      } else {
        if (setting?.fieldColor) {
          color = setting.fieldColor;
        } else {
          color = await requestColor(coloring.pool, coloring.seed, field);
        }
      }
    }

    if (coloring.by === COLOR_BY.VALUE) {
      if (setting) {
        if (isTagged) {
          const tagColor = labelTagColors?.valueColors?.find((pair) =>
            label.tags.includes(pair.value)
          )?.color;
          if (tagColor && Boolean(colorString.get(tagColor))) {
            color = tagColor;
          } else {
            color = await requestColor(
              coloring.pool,
              coloring.seed,
              label.tags.length > 0 ? label.tags[0] : "_label_tags"
            );
          }
        } else {
          const key = setting.colorByAttribute
            ? setting.colorByAttribute === "index"
              ? ["string", "number"].includes(typeof label.index)
                ? "index"
                : "id"
              : setting.colorByAttribute
            : "label";

          const valueColor = setting?.valueColors?.find((l) => {
            if (
              ["none", "null", "undefined"].includes(l.value?.toLowerCase())
            ) {
              return typeof label[key] === "string"
                ? l.value?.toLowerCase === label[key]
                : !label[key];
            }
            if (["True", "False"].includes(l.value?.toString())) {
              return (
                l.value?.toString().toLowerCase() ==
                label[key]?.toString().toLowerCase()
              );
            }
            return l.value?.toString() == label[key]?.toString();
          })?.color;
          color = valueColor
            ? valueColor
            : await requestColor(coloring.pool, coloring.seed, label[key]);
        }
      } else {
        color = await requestColor(coloring.pool, coloring.seed, label.label);
      }
    }

    const overlay = new Uint32Array(label.mask.image);
    const targets = new ARRAY_TYPES[label.mask.data.arrayType](
      label.mask.data.buffer
    );
    const bitColor = get32BitColor(color);

    // these for loops must be fast. no "in" or "of" syntax
    for (let i = 0; i < overlay.length; i++) {
      if (targets[i]) {
        overlay[i] = bitColor;
      }
    }
  },
  Detections: async (
    field,
    labels,
    coloring: Coloring,
    customizeColorSetting: CustomizeColor[],
    labelTagColors: LabelTagColor,
    selectedLabelTags: string[]
  ) => {
    const promises = labels.detections.map((label) =>
      PainterFactory(requestColor)[label._cls](
        field,
        label,
        coloring,
        customizeColorSetting,
        labelTagColors,
        selectedLabelTags
      )
    );

    await Promise.all(promises);
  },
  Heatmap: async (
    field,
    label,
    coloring: Coloring,
    customizeColorSetting: CustomizeColor[],
    selectedLabelTags: string[],
    labelTagColors: LabelTagColor
  ) => {
    if (!label.map) {
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

    const setting = customizeColorSetting?.find((s) => s.path === field);

    const color =
      setting?.fieldColor ??
      (await requestColor(coloring.pool, coloring.seed, field));

    const getColor =
      coloring.by === "value"
        ? (value) => {
            if (value === 0) {
              return 0;
            }

            const index = Math.round(
              (Math.max(value - start, 0) / (stop - start)) *
                (coloring.scale.length - 1)
            );

            return get32BitColor(coloring.scale[index]);
          }
        : (value) => {
            // render in field’s color with opacity proportional to the magnitude of the heatmap’s value
            const absMax = Math.max(Math.abs(start), Math.abs(stop));

            // clip value
            if (value < start) {
              value = start;
            } else if (value > stop) {
              value = stop;
            }

            const alpha = Math.abs(value) / absMax;

            return get32BitColor(color, alpha);
          };

    // these for loops must be fast. no "in" or "of" syntax
    for (let i = 0; i < overlay.length; i++) {
      if (targets[i] !== 0) {
        if (mapData.channels > 2) {
          overlay[i] = getColor(
            getRgbFromMaskData(targets, mapData.channels, i)[0]
          );
        } else {
          overlay[i] = getColor(targets[i]);
        }
      }
    }
  },
  Segmentation: async (
    field,
    label,
    coloring,
    customizeColorSetting: CustomizeColor[],
    selectedLabelsTags: string[],
    labelTagColors: LabelTagColor
  ) => {
    if (!label.mask) {
      return;
    }

    // the actual overlay that'll be painted, byte-length of width * height * 4 (RGBA channels)
    const overlay = new Uint32Array(label.mask.image);

    // each field may have its own target map
    let maskTargets: MaskTargets = coloring.maskTargets[field];

    // or, in the absence of field specific targets, use default mask targets that are dataset scoped
    if (!maskTargets) {
      maskTargets = coloring.defaultMaskTargets;
    }

    const maskData: OverlayMask = label.mask.data;

    // target map array
    const targets = new ARRAY_TYPES[maskData.arrayType](maskData.buffer);

    const isMaskTargetsEmpty = Object.keys(maskTargets).length === 0;

    const isRgbMaskTargets_ = isRgbMaskTargets(maskTargets);

    if (maskData.channels > 2) {
      for (let i = 0; i < overlay.length; i++) {
        const [r, g, b] = getRgbFromMaskData(targets, maskData.channels, i);

        const currentHexCode = rgbToHexCached([r, g, b]);

        if (
          // #000000 is semantically treated as background
          currentHexCode === "#000000" ||
          // don't render color if hex is not in mask targets, unless mask targets is completely empty
          (!isMaskTargetsEmpty &&
            isRgbMaskTargets_ &&
            !(currentHexCode in maskTargets))
        ) {
          targets[i] = 0;
          continue;
        }

        overlay[i] = get32BitColor([r, g, b]);

        if (isRgbMaskTargets_) {
          targets[i] = (maskTargets as RgbMaskTargets)[
            currentHexCode
          ].intTarget;
        } else {
          // assign an arbitrary uint8 value here; this isn't used anywhere but absence of it affects tooltip behavior
          targets[i] = r;
        }
      }

      // discard the buffer values of other channels
      maskData.buffer = maskData.buffer.slice(0, overlay.length);
    } else {
      const cache = {};

      let color;
      const setting = customizeColorSetting.find((x) => x.path === field);
      if (
        coloring.by === COLOR_BY.FIELD ||
        (maskTargets && Object.keys(maskTargets).length === 1)
      ) {
        let fieldColor;

        // if field color has valid custom settings, use the custom field color
        // convert the color into hex code, since it could be a color name (e.g. yellowgreen)
        fieldColor = setting?.fieldColor
          ? setting.fieldColor
          : await requestColor(coloring.pool, coloring.seed, field);
        color = get32BitColor(convertToHex(fieldColor));
      }

      const getColor = (i: number) => {
        if (!(i in cache)) {
          cache[i] = get32BitColor(
            convertToHex(
              coloring.targets[
                Math.round(Math.abs(i)) % coloring.targets.length
              ]
            )
          );
        }

        return cache[i];
      };

      // convert the defaultMaskTargetsColors and fields maskTargetsColors into objects to improve performance
      const defaultSetting = convertMaskColorsToObject(
        coloring.defaultMaskTargetsColors
      );
      const fieldSetting = convertMaskColorsToObject(
        setting?.maskTargetsColors
      );

      // these for loops must be fast. no "in" or "of" syntax
      for (let i = 0; i < overlay.length; i++) {
        if (targets[i] !== 0) {
          if (
            !(targets[i] in maskTargets) &&
            !isMaskTargetsEmpty &&
            !isRgbMaskTargets_
          ) {
            targets[i] = 0;
          } else {
            if (coloring.by == COLOR_BY.VALUE) {
              // Attempt to find a color in the fields mask target color settings
              // If not found, attempt to find a color in the default mask target colors.

              const target = targets[i].toString()
              const customColor =
                fieldSetting?.[target] || defaultSetting?.[target];

              // If a customized color setting is found, get the 32-bit color representation.
              if (customColor) {
                color = get32BitColor(convertToHex(customColor));
              } else {
                color = getColor(targets[i]);
              }
            }

            overlay[i] = color ? color : getColor(targets[i]);
          }
        }
      }
    }
  },
});

const isFloatArray = (arr) =>
  arr instanceof Float32Array || arr instanceof Float64Array;

const getRgbFromMaskData = (
  maskTypedArray: TypedArray,
  channels: number,
  index: number
) => {
  const r = maskTypedArray[index * channels];
  const g = maskTypedArray[index * channels + 1];
  const b = maskTypedArray[index * channels + 2];

  return [r, g, b] as [number, number, number];
};

export const convertToHex = (color: string) =>
  colorString.to.hex(colorString.get.rgb(color));

const convertMaskColorsToObject = (array: MaskColorInput[]) => {
  const result = {};
  if (!array) return {};
  array.forEach((item) => {
    result[item.intTarget.toString()] = item.color;
  });
  return result;
};
