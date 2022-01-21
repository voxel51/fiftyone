/**
 * Copyright 2017-2022, Voxel51, Inc.
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
  INT_FIELD,
  LABELS_PATH,
  LIST_FIELD,
  OBJECT_ID_FIELD,
  REGRESSION,
  Schema,
  STRING_FIELD,
  withPath,
} from "@fiftyone/utilities";

import { getColor } from "../../color";
import { Classification, Regression } from "../../overlays/classifications";
import { BaseState, NONFINITE, Sample } from "../../state";
import { BaseElement } from "../base";

import { prettify } from "./util";

import { lookerTags } from "./tags.module.css";

interface TagData {
  color: string;
  title: string;
  value: string;
}

export class TagsElement<State extends BaseState> extends BaseElement<State> {
  private activePaths: string[] = [];
  private colorByValue: boolean;
  private colorSeed: number;

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
      options: { activePaths, coloring, timeZone },
    }: Readonly<State>,
    sample: Readonly<Sample>
  ) {
    if (
      arraysAreEqual(activePaths, this.activePaths) &&
      this.colorByValue === coloring.byLabel &&
      this.colorSeed === coloring.seed
    ) {
      return this.element;
    }

    const elements: TagData[] = [];

    const PRIMITIVE_RENDERERS: {
      [key: string]: (
        path: string,
        value: unknown
      ) => { color: string; value: string; title: string };
    } = {
      [BOOLEAN_FIELD]: (path, value: boolean) => {
        const v = value ? "True" : "False";
        return {
          value: v,
          title: `${path}: ${v}`,
          color: getColor(
            coloring.pool,
            coloring.seed,
            coloring.byLabel ? value : path
          ),
        };
      },
      [INT_FIELD]: (path, value: number) => {
        const v = prettyNumber(value);

        return {
          value: v,
          title: `${path}: ${v}`,
          color: getColor(
            coloring.pool,
            coloring.seed,
            coloring.byLabel ? value : path
          ),
        };
      },
      [DATE_FIELD]: (path, value: { datetime: number }) => {
        const v = formatDate(value.datetime);

        return {
          value: v,
          title: `${path}: ${v}`,
          color: getColor(
            coloring.pool,
            coloring.seed,
            coloring.byLabel ? value.datetime : path
          ),
        };
      },
      [DATE_TIME_FIELD]: (path, value: { datetime: number }) => {
        const v = formatDateTime(value.datetime, timeZone);

        return {
          value: v,
          title: `${path}: ${v}`,
          color: getColor(
            coloring.pool,
            coloring.seed,
            coloring.byLabel ? value.datetime : path
          ),
        };
      },
      [FLOAT_FIELD]: (path: string, value: number) => {
        const v = prettyNumber(value);

        return {
          value: v,
          title: `${path}: ${value}`,
          color: getColor(
            coloring.pool,
            coloring.seed,
            coloring.byLabel ? value : path
          ),
        };
      },
      [FRAME_NUMBER_FIELD]: (path, value: number) => {
        const v = prettyNumber(value);

        return {
          value: v,
          title: `${path}: ${v}`,
          color: getColor(
            coloring.pool,
            coloring.seed,
            coloring.byLabel ? value : path
          ),
        };
      },
      [FRAME_SUPPORT_FIELD]: (path, value: [number, number]) => {
        const v = `[${value.join(", ")}]`;
        return {
          value: v,
          title: `${path}: ${v}`,
          color: getColor(
            coloring.pool,
            coloring.seed,
            coloring.byLabel ? v : path
          ),
        };
      },
      [OBJECT_ID_FIELD]: (path, value: string) => {
        return {
          value,
          title: `${path}: ${value}`,
          color: getColor(
            coloring.pool,
            coloring.seed,
            coloring.byLabel ? value : path
          ),
        };
      },
      [STRING_FIELD]: (path, value: string) => ({
        value,
        title: `${path}: ${value}`,
        color: getColor(
          coloring.pool,
          coloring.seed,
          coloring.byLabel ? value : path
        ),
      }),
    };

    const LABEL_RENDERERS: {
      [key: string]: (
        path: string,
        value: unknown
      ) => { color: string; value: string; title: string };
    } = {
      [withPath(LABELS_PATH, CLASSIFICATION)]: (
        path,
        { label }: Classification
      ) => ({
        value: label,
        title: `${path}: ${label}`,
        color: getColor(
          coloring.pool,
          coloring.seed,
          coloring.byLabel ? label : path
        ),
      }),
      [withPath(LABELS_PATH, CLASSIFICATIONS)]: (
        path,
        { label }: Classification
      ) => ({
        value: label,
        title: `${path}: ${label}`,
        color: getColor(
          coloring.pool,
          coloring.seed,
          coloring.byLabel ? label : path
        ),
      }),
      [withPath(LABELS_PATH, REGRESSION)]: (path, { value }: Regression) => {
        const v = prettyNumber(value);
        return {
          value: v,
          title: `${path}: ${v}`,
          color: getColor(
            coloring.pool,
            coloring.seed,
            coloring.byLabel ? value : path
          ),
        };
      },
    };

    for (let index = 0; index < activePaths.length; index++) {
      const path = activePaths[index];
      if (
        path.startsWith("tags.") &&
        Array.isArray(sample.tags) &&
        sample.tags.includes(path.slice(5))
      ) {
        const tag = path.slice(5);
        elements.push({
          color: getColor(coloring.pool, coloring.seed, path),
          title: tag,
          value: tag,
        });

        continue;
      }

      if (path.startsWith("_label_tags.")) {
        const tag = path.slice("_label_tags.".length);
        const count = sample._label_tags[tag] || 0;
        if (count > 0) {
          const value = `${tag}: ${count}`;
          elements.push({
            color: getColor(coloring.pool, coloring.seed, path),
            title: value,
            value,
          });
        }

        continue;
      }

      const [field, value] = getFieldAndValue(sample, fieldSchema, path);

      if (value === undefined) continue;

      if (LABEL_RENDERERS[field.embeddedDocType]) {
        elements.push(LABEL_RENDERERS[field.embeddedDocType](path, value));
      }

      if (PRIMITIVE_RENDERERS[field.ftype]) {
        elements.push(PRIMITIVE_RENDERERS[field.ftype](path, value));
      } else if (
        field.ftype === LIST_FIELD &&
        PRIMITIVE_RENDERERS[field.subfield] &&
        value
      ) {
        let count = 0;
        let rest = 0;
        for (let index = 0; index < (value as Array<unknown>).length; index++) {
          if (
            PRIMITIVE_RENDERERS[field.subfield](path, value[index]) &&
            count < 3
          ) {
            count++;
            elements.push(
              PRIMITIVE_RENDERERS[field.subfield](path, value[index])
            );
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
      }
    }

    this.colorByValue = coloring.byLabel;
    this.colorSeed = coloring.seed;
    this.activePaths = [...activePaths];
    this.element.innerHTML = "";

    elements.forEach(({ value, color, title }) => {
      const div = document.createElement("div");
      const child = prettify(value);
      child instanceof HTMLElement
        ? div.appendChild(child)
        : (div.innerHTML = child);
      div.title = title;
      div.style.backgroundColor = color;
      this.element.appendChild(div);
    });

    return this.element;
  }
}

const arraysAreEqual = (a: any[], b: any[]): boolean => {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (a.length !== b.length) return false;

  for (var i = 0; i < a.length; ++i) {
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

const getFieldAndValue = (
  sample: Sample,
  schema: Schema,
  path: string
): [Field, unknown] => {
  let value = sample;
  let field: Field = null;
  for (const key of path.split(".")) {
    field = schema[key];
    if (![undefined, null].includes(value)) value = value[field.dbField || key];
    schema = field.fields;
  }

  return [field, value];
};
