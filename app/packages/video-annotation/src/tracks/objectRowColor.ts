import { getLabelColorFromContext } from "@fiftyone/lighter";
import { COLOR_BY } from "@fiftyone/utilities";
import type { PerInstanceLabel } from "./frameTracks";

type ColorContext = Parameters<typeof getLabelColorFromContext>[2];

/**
 * An object track row's color. A `null` label is a Segmentation or Heatmap
 * row, which takes its field's color in every color-by mode: those overlays
 * paint per target or by colorscale, so the field color is what they share.
 */
export const objectRowColor = (
  label: PerInstanceLabel | null,
  path: string,
  context: ColorContext,
): string =>
  label
    ? getLabelColorFromContext(path, label, context)
    : getLabelColorFromContext(
        path,
        {},
        {
          ...context,
          colorScheme: { ...context.colorScheme, colorBy: COLOR_BY.FIELD },
        },
      );
