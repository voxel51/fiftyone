/**
 * Copyright 2017-2023, Voxel51, Inc.
 */
import {
  BOOLEAN_FIELD,
  CLASSIFICATION,
  CLASSIFICATIONS,
  DATE_FIELD,
  DATE_TIME_FIELD,
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
import { RegularLabel } from "../../overlays/base";
import { Classification, Regression } from "../../overlays/classifications";
import { BaseState, CustomizeColor, NONFINITE, Sample } from "../../state";
import { BaseElement } from "../base";
import { lookerTags } from "./tags.module.css";
import {
  getColorFromOptions,
  getColorFromOptionsPrimitives,
  prettify,
} from "./util";

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
      options: { activePaths, coloring, timeZone, customizeColorSetting },
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
        this.colorSeed === coloring.seed) ||
      !sample
    ) {
      return this.element;
    }

    const elements: TagData[] = [];

    const PRIMITIVE_RENDERERS = {
      [BOOLEAN_FIELD]: (path, value: boolean) => {
        const v = value ? "True" : "False";
        return {
          path,
          value: v,
          title: `${path}: ${v}`,
          color: getColorFromOptionsPrimitives({
            coloring,
            path,
            value,
            customizeColorSetting,
          }),
        };
      },
      [INT_FIELD]: (path, value: number) => {
        const v = prettyNumber(value);

        return {
          path,
          value: v,
          title: `${path}: ${v}`,
          color: getColorFromOptionsPrimitives({
            coloring,
            path,
            value: v,
            customizeColorSetting,
          }),
        };
      },
      [DATE_FIELD]: (path, value: { datetime: number }) => {
        const v = formatDate(value.datetime);

        return {
          path,
          value: v,
          title: `${path}: ${v}`,
          color: getColorFromOptionsPrimitives({
            coloring,
            path,
            value: v,
            customizeColorSetting,
          }),
        };
      },
      [DATE_TIME_FIELD]: (path, value: { datetime: number }) => {
        const v = formatDateTime(value.datetime, timeZone);

        return {
          path,
          value: v,
          title: `${path}: ${v}`,
          color: getColorFromOptionsPrimitives({
            coloring,
            path,
            value: v,
            customizeColorSetting,
          }),
        };
      },
      [FLOAT_FIELD]: (path: string, value: number) => {
        const v = prettyNumber(value);

        return {
          path,
          value: v,
          title: `${path}: ${value}`,
          color: getColorFromOptionsPrimitives({
            coloring,
            path,
            value: v,
            customizeColorSetting,
          }),
        };
      },
      [FRAME_NUMBER_FIELD]: (path, value: number) => {
        const v = prettyNumber(value);

        return {
          path,
          value: v,
          title: `${path}: ${v}`,
          color: getColorFromOptionsPrimitives({
            coloring,
            path,
            value: v,
            customizeColorSetting,
          }),
        };
      },
      [FRAME_SUPPORT_FIELD]: (path, value: [number, number]) => {
        const v = `[${value.join(", ")}]`;
        return {
          path,
          value: v,
          title: `${path}: ${v}`,
          color: getColorFromOptionsPrimitives({
            coloring,
            path,
            value: v,
            customizeColorSetting,
          }),
        };
      },
      [OBJECT_ID_FIELD]: (path, value: string) => {
        return {
          path,
          value,
          title: `${path}: ${value}`,
          color: getColorFromOptionsPrimitives({
            coloring,
            path,
            value,
            customizeColorSetting,
          }),
        };
      },
      [STRING_FIELD]: (path, value: string) => {
        return {
          path,
          value,
          title: `${path}: ${value}`,
          color: getColorFromOptionsPrimitives({
            coloring,
            path,
            value,
            customizeColorSetting,
          }),
        };
      },
    };

    const LABEL_RENDERERS = {
      [withPath(LABELS_PATH, CLASSIFICATION)]: (
        path,
        param: Classification
      ) => {
        if (!param.label) {
          return null;
        }
        return {
          path,
          value: param.label,
          title: `${path}: ${param.label}`,
          color: getColorFromOptions({
            coloring,
            path,
            param,
            customizeColorSetting,
            labelDefault: true,
          }),
        };
      },
      [withPath(LABELS_PATH, REGRESSION)]: (path, param: Regression) => {
        const v = prettyNumber(param.value);
        return {
          path,
          value: v,
          title: `${path}: ${v}`,
          color: getColorFromOptions({
            coloring,
            path,
            param,
            customizeColorSetting,
            labelDefault: false,
          }),
        };
      },
    };

    for (let index = 0; index < activePaths.length; index++) {
      const path = activePaths[index];
      if (path === "tags") {
        if (Array.isArray(sample.tags)) {
          sample.tags.forEach((tag) => {
            const v = coloring.by === "value" ? tag : "tags";
            elements.push({
              color: getColorFromOptions({
                coloring,
                path,
                param: tag,
                customizeColorSetting,
                labelDefault: false,
              }),
              title: tag,
              value: tag,
              path: v,
            });
          });
        }
      } else if (path === "_label_tags") {
        Object.entries(sample._label_tags ?? {}).forEach(([tag, count]) => {
          const value = `${tag}: ${count}`;
          const v = coloring.by === "value" ? tag : path;
          elements.push({
            color: getColor(coloring.pool, coloring.seed, v),
            title: value,
            value: value,
            path: v,
          });
        });
      } else {
        const [field, value] = getFieldAndValue(sample, fieldSchema, path);

        if (field === null) {
          continue;
        }

        const pushList = (renderer, value: unknown[]) => {
          let count = 0;
          let rest = 0;

          value = value.flat();

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
          if (path.startsWith("frames.")) continue;

          Array.isArray(value)
            ? pushList(LABEL_RENDERERS[field.embeddedDocType], value)
            : elements.push(
                LABEL_RENDERERS[field.embeddedDocType](path, value)
              );

          continue;
        }

        if (field && PRIMITIVE_RENDERERS[field.ftype]) {
          Array.isArray(value)
            ? pushList(PRIMITIVE_RENDERERS[field.ftype], value)
            : elements.push(PRIMITIVE_RENDERERS[field.ftype](path, value));
          continue;
        }

        if (
          field &&
          field.ftype === LIST_FIELD &&
          PRIMITIVE_RENDERERS[field.subfield]
        ) {
          pushList(PRIMITIVE_RENDERERS[field.subfield], value);
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
        div.setAttribute("data-cy", `tag-${path}`);
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
  if (value % 1 === 0) {
    string = value.toFixed(0);
  } else if (value < 0.001) {
    string = value.toFixed(6);
  } else {
    string = value.toFixed(3);
  }
  return Number(string).toLocaleString();
};

const unwind = (name: string, value: RegularLabel, depth = 1) => {
  if (Array.isArray(value) && depth) {
    return value.map((val) => unwind(name, val), depth - 1);
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
): [Field | null, RegularLabel] => {
  let value: RegularLabel | undefined | object = sample;
  let field: Field = null;

  // only search up to field.subfield as that is what the sidebar supports
  for (const key of path.split(".").slice(0, 2)) {
    if (!schema?.[key]) {
      return [null, null];
    }

    field = schema[key];

    if (field && field.embeddedDocType === "fiftyone.core.frames.FrameSample") {
      return [null, null];
    }

    if (![undefined, null].includes(value) && field) {
      value = unwind(field.dbField, value as RegularLabel);
    }

    if (
      field &&
      field.embeddedDocType === withPath(LABELS_PATH, CLASSIFICATIONS)
    ) {
      value = value?.["classifications"] || [];
      field = field.fields?.["classifications"];
      break;
    }

    schema = field ? field.fields : null;
  }

  return [field, value as RegularLabel];
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
