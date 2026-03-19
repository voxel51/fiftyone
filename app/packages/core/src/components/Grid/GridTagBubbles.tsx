import { computeTagData } from "@fiftyone/looker/src/elements/common/computeTagData";
import * as fos from "@fiftyone/state";
import { prettify } from "@fiftyone/utilities";
import React, { useMemo } from "react";
import styles from "./GridTagBubbles.module.css";

const DEFAULT_FONT_SIZE = 14;
const SPACING_COEFFICIENT = 0.1;

type GridTagBubblesProps = {
  sample?: Record<string, unknown>;
};

const DEFAULT_FILTER = () => true;

const getTagAttribute = (path: string | undefined, value: string) => {
  const tagValue = value.replace(/[\s.,/]/g, "-").toLowerCase();
  const pathValue = path ?? "undefined";
  return ["tags", "_label_tags"].includes(pathValue)
    ? `tag-${pathValue}-${tagValue}`
    : `tag-${pathValue}`;
};

export default function GridTagBubbles({ sample }: GridTagBubblesProps) {
  const options = fos.useLookerOptions(false);
  const fieldSchema = fos.useSampleSchema();

  const spacing = `${
    (options.fontSize ?? DEFAULT_FONT_SIZE) * SPACING_COEFFICIENT
  }px`;

  const tags = useMemo(() => {
    if (
      !sample ||
      !fieldSchema ||
      !options?.activePaths?.length ||
      !options.coloring
    ) {
      return [];
    }

    return computeTagData({
      activePaths: options.activePaths,
      attributeVisibility: options.attributeVisibility ?? {},
      coloring: options.coloring,
      customizeColorSetting: options.customizeColorSetting ?? [],
      filter: options.filter ?? DEFAULT_FILTER,
      fieldSchema,
      labelTagColors: options.labelTagColors ?? {},
      sample,
      selectedLabelTags: options.selectedLabelTags,
      timeZone: options.timeZone ?? "UTC",
    });
  }, [
    fieldSchema,
    options.activePaths,
    options.attributeVisibility,
    options.coloring,
    options.customizeColorSetting,
    options.filter,
    options.labelTagColors,
    options.selectedLabelTags,
    options.timeZone,
    sample,
  ]);

  if (!tags.length) {
    return null;
  }

  return (
    <div className={styles.gridTagBubbles}>
      {tags.map(({ color, path, title, value }, index) => {
        const formattedValue = prettify(value);
        return (
          <div
            className={styles.gridTagBubble}
            data-cy={getTagAttribute(path, value)}
            key={`${path ?? "none"}-${value}-${index}`}
            style={{ backgroundColor: color, margin: spacing }}
            title={title}
          >
            {formattedValue instanceof URL ? (
              <a
                href={formattedValue.toString()}
                onClick={(event) => event.stopPropagation()}
              >
                {formattedValue.toString()}
              </a>
            ) : (
              formattedValue
            )}
          </div>
        );
      })}
    </div>
  );
}
