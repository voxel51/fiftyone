import { COLOR_BY, get32BitColor } from "@fiftyone/utilities";
import colorString from "color-string";
import { ARRAY_TYPES } from "../../numpy";
import type { DetectionLabel } from "../../overlays/detection";
import { getHashLabel, shouldShowLabelTag } from "../../overlays/util";
import type { Painter } from "./utils";
import { requestColor } from "./utils";

const detection: Painter<DetectionLabel> = async ({
  field,
  label,
  coloring,
  customizeColorSetting,
  labelTagColors,
  selectedLabelTags,
}) => {
  if (!label?.mask) {
    return;
  }

  const setting = customizeColorSetting?.find((s) => s.path === field);
  let color: string;

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
        color = await requestColor(coloring.pool, coloring.seed, "_label_tags");
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
          if (["none", "null", "undefined"].includes(l.value?.toLowerCase())) {
            return typeof label[key] === "string"
              ? l.value?.toLowerCase === label[key]
              : !label[key];
          }
          if (["True", "False"].includes(l.value?.toString())) {
            return (
              l.value?.toString().toLowerCase() ===
              label[key]?.toString().toLowerCase()
            );
          }
          return l.value?.toString() === label[key]?.toString();
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
};

export default detection;
