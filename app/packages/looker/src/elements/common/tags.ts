/**
 * Copyright 2017-2025, Voxel51, Inc.
 */
import type { COLOR_BY } from "@fiftyone/utilities";
import {
  BOOLEAN_FIELD,
  CLASSIFICATION,
  CLASSIFICATIONS,
  DATE_FIELD,
  DATE_TIME_FIELD,
  DYNAMIC_EMBEDDED_DOCUMENT_PATH,
  FLOAT_FIELD,
  FRAME_NUMBER_FIELD,
  FRAME_SUPPORT_FIELD,
  INT_FIELD,
  LABELS_PATH,
  LIST_FIELD,
  OBJECT_ID_FIELD,
  REGRESSION,
  STRING_FIELD,
  TEMPORAL_DETECTION,
  TEMPORAL_DETECTIONS,
  formatDate,
  formatDateTime,
  getColor,
  withPath,
} from "@fiftyone/utilities";
import { isEqual } from "lodash";
import type {
  Classification,
  Regression,
  TemporalDetectionLabel,
} from "../../overlays/classifications";
import { isValidColor, shouldShowLabelTag } from "../../overlays/util";
import type {
  BaseState,
  CustomizeColor,
  LabelTagColor,
  NONFINITE,
  Sample,
} from "../../state";
import { BaseElement } from "../base";
import { getBubbles, getField } from "./bubbles";
import { lookerTags } from "./tags.module.css";
import { getAssignedColor, prettify } from "./util";

interface TagData {
  color: string;
  title: string;
  path?: string;
  value: string;
}

const LINE_HEIGHT_COEFFICIENT = 1.15;
const SPACING_COEFFICIENT = 0.1;

type Renderer = (
  path: string,
  value: unknown
) => { color: string; path: string; value: string; title: string };

type Renderers = { [key: string]: Renderer };
export class TagsElement<State extends BaseState> extends BaseElement<State> {
  private activePaths: string[] = [];
  private attributeVisibility: object;
  private colorBy: COLOR_BY.FIELD | COLOR_BY.VALUE | COLOR_BY.INSTANCE;
  private colorPool: string[];
  private colorSeed: number;
  private customizedColors: CustomizeColor[] = [];
  private fontSize?: number;
  private labelTagColors: LabelTagColor = {};
  private playing = false;

  createHTMLElement() {
    const container = document.createElement("div");
    container.classList.add(lookerTags);
    return container;
  }

  isShown({ thumbnail }: Readonly<State["config"]>) {
    return thumbnail;
  }

  renderSelf(
    {
      config: { fieldSchema },
      options: {
        activePaths,
        attributeVisibility,
        coloring,
        customizeColorSetting,
        fontSize,
        filter,
        labelTagColors,
        selectedLabelTags,
        timeZone,
      },
      playing,
    }: Readonly<State>,
    sample: Readonly<Sample>
  ) {
    this.handleFont(fontSize);
    if (this.playing !== playing) {
      this.playing = playing;
      if (playing) {
        this.element.textContent = "";
        return this.element;
      }
    } else if (
      (arraysAreEqual(activePaths, this.activePaths) &&
        this.colorBy === coloring.by &&
        arraysAreEqual(this.colorPool, coloring.pool as string[]) &&
        compareObjectArrays(this.customizedColors, customizeColorSetting) &&
        isEqual(this.labelTagColors, labelTagColors) &&
        isEqual(this.attributeVisibility, attributeVisibility) &&
        this.colorSeed === coloring.seed) ||
      !sample
    ) {
      return this.element;
    }

    const elements: TagData[] = [];

    const PRIMITIVE_RENDERERS: Renderers = {
      [BOOLEAN_FIELD]: (path, value: boolean) => {
        let v: string;
        if (Array.isArray(value)) {
          v = value.map((v) => (v ? "True" : "False")).join(", ");
        } else {
          v = value ? "True" : "False";
        }

        return {
          path,
          value: v,
          title: `${path}: ${v}`,
          color: getAssignedColor({
            coloring,
            path,
            value,
            customizeColorSetting,
            isValidColor,
          }),
        };
      },
      [INT_FIELD]: (path, value: number) => {
        const v = prettyNumber(value);
        return {
          path,
          value: v,
          title: `${path}: ${v}`,
          color: getAssignedColor({
            coloring,
            path,
            value: v,
            customizeColorSetting,
            isValidColor,
          }),
        };
      },
      [DATE_FIELD]: (path, value: { datetime: number }) => {
        const v = formatDate(value.datetime);

        return {
          path,
          value: v,
          title: `${path}: ${v}`,
          color: getAssignedColor({
            coloring,
            path,
            value: v,
            customizeColorSetting,
            isValidColor,
          }),
        };
      },
      [DATE_TIME_FIELD]: (path, value: { datetime: number }) => {
        const v = formatDateTime(value.datetime, timeZone);

        return {
          path,
          value: v,
          title: `${path}: ${v}`,
          color: getAssignedColor({
            coloring,
            path,
            value: v,
            customizeColorSetting,
            isValidColor,
          }),
        };
      },
      [FLOAT_FIELD]: (path: string, value: number) => {
        const v = prettyNumber(value);
        return {
          path,
          value: v,
          title: `${path}: ${value}`,
          color: getAssignedColor({
            coloring,
            path,
            value: v,
            customizeColorSetting,
            isValidColor,
          }),
        };
      },
      [FRAME_NUMBER_FIELD]: (path, value: number) => {
        const v = prettyNumber(value);

        return {
          path,
          value: v,
          title: `${path}: ${v}`,
          color: getAssignedColor({
            coloring,
            path,
            value: v,
            customizeColorSetting,
            isValidColor,
          }),
        };
      },
      [FRAME_SUPPORT_FIELD]: (path, value: [number, number]) => {
        const v = `[${value.join(", ")}]`;
        return {
          path,
          value: v,
          title: `${path}: ${v}`,
          color: getAssignedColor({
            coloring,
            path,
            value: v,
            customizeColorSetting,
            isValidColor,
          }),
        };
      },
      [OBJECT_ID_FIELD]: (path, value: string) => {
        return {
          path,
          value,
          title: `${path}: ${value}`,
          color: getAssignedColor({
            coloring,
            path,
            value,
            customizeColorSetting,
            isValidColor,
          }),
        };
      },
      [STRING_FIELD]: (path, value: string) => {
        let v: string;
        if (Array.isArray(value)) {
          v = value.join(", ");
        } else {
          v = value;
        }
        return {
          path,
          value: v,
          title: `${path}: ${v}`,
          color: getAssignedColor({
            coloring,
            path,
            value: v,
            customizeColorSetting,
            isValidColor,
          }),
        };
      },
    };

    const CLASSIFICATION_RENDERER = (path, param: Classification) => {
      if (!param.label) {
        return null;
      }

      return {
        path,
        value: param.label,
        title: `${path}: ${param.label}`,
        color: getAssignedColor({
          coloring,
          path,
          param,
          isTagged: shouldShowLabelTag(selectedLabelTags, param.tags),
          labelTagColors,
          customizeColorSetting,
          isValidColor,
        }),
      };
    };

    const TEMPORAL_DETECTION_RENDERER = (
      path,
      param: TemporalDetectionLabel
    ) => {
      if (!param.label) {
        return null;
      }

      const support = param.support?.length
        ? ` [${param.support[0]}, ${param.support[1]}]`
        : "";

      return {
        path,
        value: `${param.label}${support}`,
        title: `${path}: ${param.label}${support}`,
        color: getAssignedColor({
          coloring,
          path,
          param,
          isTagged: shouldShowLabelTag(selectedLabelTags, param.tags),
          labelTagColors,
          customizeColorSetting,
          isValidColor,
        }),
      };
    };

    const EMBEDDED_DOCUMENT_RENDERER = (
      path: string,
      values: { [key: string]: unknown }
    ) => {
      const results = [];
      for (const [k, v] of Object.entries(values || {})) {
        const field = getField([...path.split("."), k], fieldSchema);
        const renderer = PRIMITIVE_RENDERERS[field.ftype];

        if (!renderer) {
          continue;
        }

        results.push(`${k}:${renderer(path, v).value}`);
      }

      const value = results.join(",");
      return {
        color: getAssignedColor({
          coloring,
          path,
          customizeColorSetting,
          isValidColor,
        }),
        path,
        title: `${path}: ${value}`,
        value,
      };
    };

    const LABEL_RENDERERS: Renderers = {
      [DYNAMIC_EMBEDDED_DOCUMENT_PATH]: EMBEDDED_DOCUMENT_RENDERER,
      [withPath(LABELS_PATH, CLASSIFICATION)]: CLASSIFICATION_RENDERER,
      [withPath(LABELS_PATH, CLASSIFICATIONS)]: CLASSIFICATION_RENDERER,
      [withPath(LABELS_PATH, REGRESSION)]: (path, param: Regression) => {
        const v = prettyNumber(param.value);
        return {
          path,
          value: v,
          title: `${path}: ${v}`,
          color: getAssignedColor({
            coloring,
            path,
            param,
            customizeColorSetting,
            fallbackLabel: "value",
            isValidColor,
          }),
        };
      },
      [withPath(LABELS_PATH, TEMPORAL_DETECTION)]: TEMPORAL_DETECTION_RENDERER,
      [withPath(LABELS_PATH, TEMPORAL_DETECTIONS)]: TEMPORAL_DETECTION_RENDERER,
    };

    for (let index = 0; index < activePaths.length; index++) {
      const path = activePaths[index];
      if (path === "tags") {
        if (Array.isArray(sample.tags)) {
          for (const tag of sample.tags) {
            if (filter(path, [tag])) {
              const v = coloring.by !== "field" ? tag : "tags";
              elements.push({
                color: getAssignedColor({
                  coloring,
                  path,
                  param: tag,
                  customizeColorSetting,
                  fallbackLabel: "value",
                  isValidColor,
                }),
                title: tag,
                value: tag,
                path: v,
              });
            }
          }
        }
      } else if (path === "_label_tags") {
        for (const [tag, count] of Object.entries(sample._label_tags ?? {})) {
          const value = `${tag}: ${count}`;
          const v = coloring.by !== "field" ? tag : path;
          if (shouldShowLabel(tag, attributeVisibility._label_tags)) {
            elements.push({
              color: getAssignedColor({
                coloring,
                path,
                param: tag,
                labelTagColors,
                customizeColorSetting,
                isValidColor,
              }),
              path: v,
              title: value,
              value: value,
            });
          }
        }
      } else {
        const [field, values] = getBubbles(path, sample, fieldSchema);

        if (field === null) {
          continue;
        }

        const pushList = (renderer, value: unknown[]) => {
          let count = 0;
          let rest = 0;
          for (let index = 0; index < value?.length; index++) {
            const result = renderer(path, value[index]);

            if (result && count < 3) {
              count++;
              elements.push(result);
            } else {
              rest++;
            }
          }

          if (rest > 0) {
            elements.push({
              color: getColor(coloring.pool, coloring.seed, path),
              title: `${path}: and ${rest} more`,
              value: `and ${rest} more`,
            });
          }
        };

        if (field && LABEL_RENDERERS[field.embeddedDocType]) {
          filter(path, values) &&
            pushList(LABEL_RENDERERS[field.embeddedDocType], values);
          continue;
        }

        if (
          field &&
          PRIMITIVE_RENDERERS[field.ftype] &&
          field.ftype !== LIST_FIELD
        ) {
          // none-list field value is in ['value'] format
          // need to convert to 'value' to pass in the filter

          filter(path, values) &&
            pushList(PRIMITIVE_RENDERERS[field.ftype], values);
          continue;
        }

        if (
          field &&
          field.ftype === LIST_FIELD &&
          PRIMITIVE_RENDERERS[field.subfield]
        ) {
          // there may be visibility settings
          const visibleValue = [];
          if (values) {
            for (const v of values) {
              if (filter(path, v)) {
                visibleValue.push(v);
              }
            }
          }

          pushList(PRIMITIVE_RENDERERS[field.subfield], visibleValue);
        }
      }
    }

    this.colorBy = coloring.by;
    this.colorSeed = coloring.seed;
    this.activePaths = [...activePaths];
    this.element.textContent = "";
    this.customizedColors = customizeColorSetting;
    this.labelTagColors = labelTagColors;
    this.colorPool = coloring.pool as string[];
    this.attributeVisibility = attributeVisibility;

    this.element.dispatchEvent(
      new CustomEvent("re-render-tag", {
        bubbles: true,
      })
    );

    const spacing = `${fontSize * SPACING_COEFFICIENT}px`;
    for (const { path, value, color, title } of elements.filter((e) =>
      Boolean(e)
    )) {
      this.element.appendChild(
        applyTagValue(color, path, title, value, spacing)
      );
    }

    return this.element;
  }

  private handleFont(fontSize?: number) {
    if (this.fontSize !== fontSize) {
      this.fontSize = fontSize;
      this.element.style.setProperty("font-size", `${fontSize}px`);

      this.element.style.setProperty(
        "line-height",
        `${fontSize * LINE_HEIGHT_COEFFICIENT}px`
      );
    }
  }
}

export const applyTagValue = (
  color: string,
  path: string,
  title: string,
  value: string,
  spacing: string
) => {
  const div = document.createElement("div");
  const child = prettify(value);

  if (child instanceof HTMLElement) {
    div.appendChild(child);
  } else {
    div.textContent = child;
  }

  div.style.setProperty("margin", spacing);

  div.title = title;
  div.style.backgroundColor = color;

  const tagValue = value.replace(/[\s.,/]/g, "-").toLowerCase();
  const attribute = ["tags", "_label_tags"].includes(path)
    ? `tag-${path}-${tagValue}`
    : `tag-${path}`;
  div.setAttribute("data-cy", attribute);
  return div;
};

const arraysAreEqual = <T>(a: T[], b: T[]): boolean => {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (a.length !== b.length) return false;

  for (let i = 0; i < a.length; ++i) {
    if (a[i] !== b[i]) return false;
  }
  return true;
};

const prettyNumber = (value: number | NONFINITE): string => {
  if (typeof value === "string") {
    return value;
  }
  let string = null;

  if (Array.isArray(value)) {
    string = value.map((v) => prettyNumber(v)).join(", ");
    return string;
  }

  if (value % 1 === 0) {
    string = value.toFixed(0);
  } else if (value < 0.001) {
    string = value.toFixed(6);
  } else {
    string = value.toFixed(3);
  }
  return Number(string).toLocaleString();
};

const compareObjectArrays = (arr1, arr2) => {
  // Check if the arrays are the same length
  if (arr1?.length !== arr2?.length) {
    return false;
  }

  // Create a copy of each array and sort them
  const sortedArr1 = arr1.slice().sort(sortObjectArrays);
  const sortedArr2 = arr2.slice().sort(sortObjectArrays);

  // Compare each object in the sorted arrays
  for (let i = 0; i < sortedArr1.length; i++) {
    const obj1 = sortedArr1[i];
    const obj2 = sortedArr2[i];

    // Check if the objects have the same keys
    const obj1Keys = Object.keys(obj1).sort();
    const obj2Keys = Object.keys(obj2).sort();
    if (JSON.stringify(obj1Keys) !== JSON.stringify(obj2Keys)) {
      return false;
    }

    // Check if the objects have the same values for each key
    for (let j = 0; j < obj1Keys.length; j++) {
      const key = obj1Keys[j];
      if (JSON.stringify(obj1[key]) !== JSON.stringify(obj2[key])) {
        return false;
      }
    }
  }

  // If all objects pass the comparison checks, return true
  return true;
};

// Helper function to sort arrays of objects based on their key-value pairs
function sortObjectArrays(a, b) {
  const keysA = Object.keys(a).sort();
  const keysB = Object.keys(b).sort();
  for (let i = 0; i < keysA.length; i++) {
    const key = keysA[i];
    const comparison = key?.localeCompare(keysB[i]);
    if (comparison !== 0) {
      return comparison;
    }
    const valueComparison = JSON.stringify(a[key])?.localeCompare(
      JSON.stringify(b[key])
    );
    if (valueComparison !== 0) {
      return valueComparison;
    }
  }
  return 0;
}

const shouldShowLabel = (
  labelTag: string,
  visibility: { values: string[]; exclude: boolean }
) => {
  if (!visibility) return true;

  const values = visibility.values;
  const exclude = visibility.exclude;

  const contains = values.includes(labelTag);
  return exclude ? !contains : contains;
};
