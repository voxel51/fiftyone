/**
 * Copyright 2017-2023, Voxel51, Inc.
 */
import {
  BOOLEAN_FIELD,
  CLASSIFICATION,
  CLASSIFICATIONS,
  DATE_FIELD,
  DATE_TIME_FIELD,
  EMBEDDED_DOCUMENT_FIELD,
  Field,
  FLOAT_FIELD,
  formatDate,
  formatDateTime,
  FRAME_NUMBER_FIELD,
  FRAME_SUPPORT_FIELD,
  getColor,
  INT_FIELD,
  LABELS_PATH,
  LIST_FIELD,
  OBJECT_ID_FIELD,
  REGRESSION,
  Schema,
  STRING_FIELD,
  withPath,
} from "@fiftyone/utilities";
import _ from "lodash";
import { RegularLabel } from "../../overlays/base";
import { Classification, Regression } from "../../overlays/classifications";
import { isValidColor } from "../../overlays/util";
import { BaseState, CustomizeColor, NONFINITE, Sample } from "../../state";
import { BaseElement } from "../base";
import { lookerTags } from "./tags.module.css";
import { getAssignedColor, prettify } from "./util";

interface TagData {
  color: string;
  title: string;
  path?: string;
  value: string;
}

export class TagsElement<State extends BaseState> extends BaseElement<State> {
  private activePaths: string[] = [];
  private customizedColors: CustomizeColor[] = [];
  private colorPool: string[];
  private colorByValue: boolean;
  private colorSeed: number;
  private playing = false;
  private attributeVisibility: object;

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
      config: { fieldSchema, ...r },
      options: {
        activePaths,
        coloring,
        timeZone,
        customizeColorSetting,
        filter,
        attributeVisibility,
      },
      playing,
    }: Readonly<State>,
    sample: Readonly<Sample>
  ) {
    if (this.playing !== playing) {
      this.playing = playing;
      if (playing) {
        this.element.innerHTML = "";
        return this.element;
      }
    } else if (
      (arraysAreEqual(activePaths, this.activePaths) &&
        this.colorByValue === (coloring.by === "value") &&
        arraysAreEqual(this.colorPool, coloring.pool as string[]) &&
        compareObjectArrays(this.customizedColors, customizeColorSetting) &&
        _.isEqual(this.attributeVisibility, attributeVisibility) &&
        this.colorSeed === coloring.seed) ||
      !sample
    ) {
      return this.element;
    }

    const elements: TagData[] = [];

    const PRIMITIVE_RENDERERS = {
      [BOOLEAN_FIELD]: (path, value: boolean) => {
        let v;
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
        let v;
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
          customizeColorSetting,
          isValidColor,
        }),
      };
    };

    const LABEL_RENDERERS = {
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
    };

    for (let index = 0; index < activePaths.length; index++) {
      const path = activePaths[index];
      if (path === "tags") {
        if (Array.isArray(sample.tags)) {
          sample.tags.forEach((tag) => {
            if (filter(path, [tag])) {
              const v = coloring.by === "value" ? tag : "tags";
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
          });
        }
      } else if (path === "_label_tags") {
        Object.entries(sample._label_tags ?? {}).forEach(([tag, count]) => {
          const value = `${tag}: ${count}`;
          const v = coloring.by === "value" ? tag : path;
          if (shouldShowLabelTag(tag, attributeVisibility["_label_tags"])) {
            elements.push({
              color: getColor(coloring.pool, coloring.seed, v),
              title: value,
              value: value,
              path: v,
            });
          }
        });
      } else {
        const [field, value] = getFieldAndValue(sample, fieldSchema, path);

        if (field === null) {
          continue;
        }

        const pushList = (renderer, value: unknown[]) => {
          let count = 0;
          let rest = 0;

          for (
            let index = 0;
            index < (value as Array<unknown>)?.length;
            index++
          ) {
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

        if (value === undefined) continue;
        if (field && LABEL_RENDERERS[field.embeddedDocType]) {
          Array.isArray(value)
            ? filter(path, value) &&
              pushList(LABEL_RENDERERS[field.embeddedDocType], value)
            : filter(path, value) &&
              elements.push(
                LABEL_RENDERERS[field.embeddedDocType](path, value)
              );

          continue;
        }

        if (
          field &&
          PRIMITIVE_RENDERERS[field.ftype] &&
          field.ftype !== LIST_FIELD
        ) {
          // none-list field value is in ['value'] format
          // need to convert to 'value' to pass in the filter
          const v =
            Array.isArray(value) && value.length == 1 ? value[0] : value;
          filter(path, v) && pushList(PRIMITIVE_RENDERERS[field.ftype], value);
          continue;
        }

        if (
          field &&
          field.ftype === LIST_FIELD &&
          PRIMITIVE_RENDERERS[field.subfield]
        ) {
          // there may be visibility settings
          const visibleValue = [];
          value?.forEach((v) => {
            if (filter(path, v)) {
              visibleValue.push(v);
            }
          });
          pushList(PRIMITIVE_RENDERERS[field.subfield], visibleValue);
          continue;
        }
      }
    }

    this.colorByValue = coloring.by === "value";
    this.colorSeed = coloring.seed;
    this.activePaths = [...activePaths];
    this.element.innerHTML = "";
    this.customizedColors = customizeColorSetting;
    this.colorPool = coloring.pool as string[];
    this.attributeVisibility = attributeVisibility;

    this.element.dispatchEvent(
      new CustomEvent("re-render-tag", {
        bubbles: true,
      })
    );

    elements
      .filter((e) => Boolean(e))
      .forEach(({ path, value, color, title }) => {
        const div = document.createElement("div");
        const child = prettify(value);
        child instanceof HTMLElement
          ? div.appendChild(child)
          : (div.innerHTML = child);
        div.title = title;
        div.style.backgroundColor = color;
        const tagValue = value.replace(/[\s.,/]/g, "-").toLowerCase();
        const attribute = ["tags", "_label_tags"].includes(path)
          ? `tag-${path}-${tagValue}`
          : `tag-${path}`;
        div.setAttribute("data-cy", attribute);
        this.element.appendChild(div);
      });

    return this.element;
  }
}

const arraysAreEqual = (a: any[], b: any[]): boolean => {
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
  } else {
    if (value % 1 === 0) {
      string = value.toFixed(0);
    } else if (value < 0.001) {
      string = value.toFixed(6);
    } else {
      string = value.toFixed(3);
    }
    return Number(string).toLocaleString();
  }
};

const unwind = (
  name: string,
  value: RegularLabel[] | RegularLabel,
  depth = 0
) => {
  if (Array.isArray(value) && depth < 2) {
    return value.map((val) => unwind(name, val), depth + 1);
  }

  const v = value[name];
  if (v !== undefined && v !== null) {
    return v;
  }

  if (name == "_id" && value.id) {
    return value.id;
  }
};

const getFieldAndValue = (
  sample: Sample,
  schema: Schema,
  path: string
): [Field | null, RegularLabel[]] => {
  let values: Array<RegularLabel> | undefined = [
    sample as unknown as RegularLabel,
  ];
  let field: Field = null;

  if (
    path.startsWith("frames.") &&
    schema?.frames?.embeddedDocType === "fiftyone.core.frames.FrameSample"
  ) {
    values = values[0]?.frames;
    schema = schema.frames.fields;
    path = path.split(".").slice(1).join(".");
  }

  for (const key of path.split(".").slice(0, 2)) {
    if (!schema?.[key]) {
      return [null, null];
    }

    field = schema[key];

    if (
      field &&
      field.ftype === LIST_FIELD &&
      field.subfield === EMBEDDED_DOCUMENT_FIELD
    ) {
      return [null, null];
    }
    if (values?.length && field) {
      values = unwind(field.dbField, values as RegularLabel[]).filter(
        (v) => v !== undefined && v !== null
      );
    }

    if (field.embeddedDocType === withPath(LABELS_PATH, CLASSIFICATIONS)) {
      values = values.map((value) => value?.["classifications"] || []).flat();
      break;
    }

    schema = field ? field.fields : null;
  }

  return [field, values];
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

const shouldShowLabelTag = (labelTag: string, visibility: object) => {
  if (!visibility) return true;

  const values = visibility["values"];
  const exclude = visibility["exclude"];

  const contains = values.includes(labelTag);
  return exclude ? !contains : contains;
};
