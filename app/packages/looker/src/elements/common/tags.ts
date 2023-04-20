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
  INT_FIELD,
  LABELS_PATH,
  LIST_FIELD,
  OBJECT_ID_FIELD,
  REGRESSION,
  Schema,
  STRING_FIELD,
  withPath,
} from "@fiftyone/utilities";

import { getColor } from "@fiftyone/utilities";
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

const LABEL_LISTS = [withPath(LABELS_PATH, CLASSIFICATIONS)];

export class TagsElement<State extends BaseState> extends BaseElement<State> {
  private activePaths: string[] = [];
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
      options: { activePaths, coloring, timeZone },
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
        this.colorByValue === (coloring.by === "label") &&
        this.colorSeed === coloring.seed) ||
      !sample
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
            coloring.by === "label" ? value : path
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
            coloring.by === "label" ? value : path
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
            coloring.by === "label" ? value.datetime : path
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
            coloring.by === "label" ? value.datetime : path
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
            coloring.by === "label" ? value : path
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
            coloring.by === "label" ? value : path
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
            coloring.by === "label" ? v : path
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
            coloring.by === "label" ? value : path
          ),
        };
      },
      [STRING_FIELD]: (path, value: string) => {
        return {
          value,
          title: `${path}: ${value}`,
          color: getColor(
            coloring.pool,
            coloring.seed,
            coloring.by === "label" ? value : path
          ),
        };
      },
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
          coloring.by === "label" ? label : path
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
          coloring.by === "label" ? label : path
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
            coloring.by === "label" ? value : path
          ),
        };
      },
    };

    for (let index = 0; index < activePaths.length; index++) {
      const path = activePaths[index];
      if (path === "tags") {
        if (Array.isArray(sample.tags)) {
          sample.tags.forEach((tag) => {
            elements.push({
              color: getColor(coloring.pool, coloring.seed, tag),
              title: tag,
              value: tag,
            });
          });
        }
      } else if (path === "_label_tags") {
        Object.entries(sample._label_tags).forEach(([tag, count]) => {
          const value = `${tag}: ${count}`;
          elements.push({
            color: getColor(coloring.pool, coloring.seed, path),
            title: value,
            value,
          });
        });
      } else {
        const [field, value, list] = getFieldAndValue(
          sample,
          fieldSchema,
          path
        );

        if (field === null) {
          continue;
        }

        const pushList = (renderer, value) => {
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
          if (path.startsWith("frames.")) continue;
          const classifications = LABEL_LISTS.includes(field.embeddedDocType);

          if (classifications) {
            pushList(
              LABEL_RENDERERS[field.embeddedDocType],
              value.classifications
            );
          } else {
            elements.push(LABEL_RENDERERS[field.embeddedDocType](path, value));
          }
          continue;
        }

        if (field && PRIMITIVE_RENDERERS[field.ftype]) {
          list
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

    this.colorByValue = coloring.by === "label";
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

const unwind = (name: string, value: unknown) => {
  if (Array.isArray(value)) {
    return value.map((val) => unwind(name, val));
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
): [Field | null, unknown, boolean] => {
  let value: unknown = sample;
  let field: Field = null;
  let list = false;

  for (const key of path.split(".")) {
    field = schema[key];

    if (field && field.embeddedDocType === "fiftyone.core.frames.FrameSample") {
      return [null, null, false];
    }

    if (![undefined, null].includes(value) && field) {
      value = unwind(field.dbField, value);
      list = list || field.ftype === LIST_FIELD;
    }

    schema = field ? field.fields : null;
  }

  if (Array.isArray(value) && value.every((v) => typeof v == "object")) {
    value = value.reduce((acc, cur) => {
      if (!acc._cls) {
        acc._cls = cur._cls;
      }
      const key = acc._cls?.toLowerCase();
      if (acc[key] == undefined) {
        acc[key] = cur[key];
      } else {
        acc[key] = [...acc[key], ...cur[key]];
      }
      return acc;
    }, {});
  }

  return [field, value, list];
};
