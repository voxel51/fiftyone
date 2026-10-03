import { getLabelColorFromContext } from "@fiftyone/lighter";
import { COLOR_BY } from "@fiftyone/utilities";
import type { PerInstanceLabel } from "./frameTracks";

type ColorContext = Parameters<typeof getLabelColorFromContext>[2];

/**
 * An object track row's color. A `null` label is a singleton field's row,
 * which takes its field's color in every color-by mode: a mask paints per
 * target or by colorscale and a classification's value changes frame to
 * frame, so the field color is what its frames share.
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
