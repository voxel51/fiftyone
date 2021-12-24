/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import {
  BOOLEAN_FIELD,
  CLASSIFICATION,
  DATE_FIELD,
  DATE_TIME_FIELD,
  EMBEDDED_DOCUMENT_FIELD,
  Field,
  FRAME_NUMBER_FIELD,
  FRAME_SUPPORT_FIELD,
  INT_FIELD,
  LABELS_PATH,
  meetsFieldType,
  Schema,
  STRING_FIELD,
  withPath,
} from "@fiftyone/utilities";
import { getColor } from "../../color";
import { BaseState, Sample } from "../../state";
import { formatDate, formatDateTime } from "../../util";
import { BaseElement } from "../base";

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
      options: { filter, activePaths, coloring, mimetype, timeZone },
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

    const FIELD_RENDERERS = {
      [BOOLEAN_FIELD]: (value) => (value ? "True" : "False"),
      [INT_FIELD]: (value) => prettyNumber(value),
      [DATE_FIELD]: (value) => formatDate(value),
      [DATE_TIME_FIELD]: (value) => formatDateTime(value, timeZone),
      [FRAME_NUMBER_FIELD]: (value) => prettyNumber(value),
      [FRAME_SUPPORT_FIELD]: (value) => `[${value.join(", ")}]`,
      [STRING_FIELD]: (value) => value,
      [EMBEDDED_DOCUMENT_FIELD]: {
        [withPath(LABELS_PATH, CLASSIFICATION)]: (value) => value,
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
      } else if (path.startsWith("_label_tags.")) {
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
      } else if (meetsFieldType(LABEL)) {
        const cls = sample[path]._cls;
        let show = []
          .filter(
            (label) =>
              filter[path](label) &&
              (mimetype.includes("video") ||
                MOMENT_CLASSIFICATIONS.includes(label._cls))
          )
          .map((label) =>
            label._cls === REGRESSION ? label.value : label.label
          );

        if (cls !== REGRESSION) {
          show = Object.entries(
            show.reduce((acc, cur) => {
              if (!acc[cur]) {
                acc[cur] = 0;
              }
              acc[cur] += 1;
              return acc;
            }, {})
          );
          elements.push(
            ...show.map(([label, count]) => ({
              color: getColor(
                coloring.pool,
                coloring.seed,
                coloring.byLabel ? label : path
              ),
              title: `${path}: ${label}`,
              value: isList
                ? `${prettify(label)}: ${count.toLocaleString()}`
                : prettify(label),
            }))
          );
        } else {
          elements.push(
            ...show.map((label) => ({
              color: getColor(coloring.pool, coloring.seed, path),
              title: `${path}: ${label}`,
              value: prettify(label),
            }))
          );
        }
      } else {
        continue;

        const appendElement = (value) => {
          if (isDateTime && value) {
            value = formatDateTime(value, timeZone);
          } else if (isDate && value) {
            value = formatDate(value);
          } else if (isSupport && Array.isArray(value)) {
            value = `[${value.map(prettify).join(", ")}]`;
          }

          const pretty = prettify(value);
          elements.push({
            color: getColor(
              coloring.pool,
              coloring.seed,
              coloring.byLabel ? value : path
            ),
            title: value,
            value: pretty,
          });
        };

        if (!Array.isArray(value) || isSupport) {
          if (!isSupport || typeof value[0] === "number") {
            value = [value];
          }
        }

        if (isDateTime || isDate) {
          value = value.map((d) => d.datetime);
        }

        const filtered =
          filter[path] && !isSupport && !isDateTime && !isDate
            ? value.filter((v) => filter[path](v))
            : value;

        const shown = [...filtered].sort().slice(0, 3);
        shown.forEach((v) => appendElement(v));

        const more = filtered.length - shown.length;
        more > 0 && appendElement(`+${more} more`);
      }
    }

    this.colorByValue = coloring.byLabel;
    this.colorSeed = coloring.seed;
    this.activePaths = [...activePaths];
    this.element.innerHTML = "";

    elements.forEach(({ value, color, title }) => {
      const div = document.createElement("div");
      div.innerHTML = value;
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

const prettyNumber = (value: number): string => {
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
