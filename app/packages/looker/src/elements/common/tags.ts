/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import { getColor } from "../../color";
import {
  BOOLEAN_FIELD,
  DATE_FIELD,
  DATE_TIME_FIELD,
  FLOAT_FIELD,
  FRAME_NUMBER_FIELD,
  FRAME_SUPPORT_FIELD,
  INT_FIELD,
  LABEL_LISTS,
  LABEL_TAGS_CLASSES,
  MOMENT_CLASSIFICATIONS,
  OBJECT_ID_FIELD,
  REGRESSION,
  STRING_FIELD,
} from "../../constants";
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
    return this.element;

    const elements = activePaths.reduce<TagData[]>((elements, path) => {
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
          elements = [
            ...elements,
            {
              color: getColor(coloring.pool, coloring.seed, path),
              title: value,
              value,
            },
          ];
        }
      } else if (
        sample[path] &&
        LABEL_TAGS_CLASSES.includes(sample[path]._cls)
      ) {
        const cls = sample[path]._cls;

        const isList = cls in LABEL_LISTS;
        const labels = isList ? sample[path][LABEL_LISTS[cls]] : [sample[path]];

        let show = labels
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
          elements = [
            ...elements,
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
            })),
          ];
        } else {
          elements = [
            ...elements,
            ...show.map((label) => ({
              color: getColor(coloring.pool, coloring.seed, path),
              title: `${path}: ${label}`,
              value: prettify(label),
            })),
          ];
        }
      } else if (isRendered(fieldSchema[path])) {
        let valuePath = path;
        if (!sample[path] && fieldsMap && fieldsMap[path]) {
          valuePath = fieldsMap[path];
        }

        let value = sample[valuePath];
        const entry = fieldSchema[path];
        const isDate = isOfTypes(entry, [DATE_FIELD]);
        const isDateTime = isOfTypes(entry, [DATE_TIME_FIELD]);
        const isSupport = isOfTypes(entry, [FRAME_SUPPORT_FIELD]);

        if ([undefined, null].includes(value)) {
          return elements;
        }

        const appendElement = (value) => {
          if (isDateTime && value) {
            value = formatDateTime(value, timeZone);
          } else if (isDate && value) {
            value = formatDate(value);
          } else if (isSupport && Array.isArray(value)) {
            value = `[${value.map(prettify).join(", ")}]`;
          }

          const pretty = prettify(value);
          elements = [
            ...elements,
            {
              color: getColor(
                coloring.pool,
                coloring.seed,
                coloring.byLabel ? value : path
              ),
              title: value,
              value: pretty,
            },
          ];
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
      return elements;
    }, []);

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

const prettify = (v: boolean | string | null | undefined | number): string => {
  if (typeof v === "string") {
    return v;
  } else if (typeof v === "number") {
    if (v % 1 === 0) {
      v = v.toFixed(0);
    } else if (v < 0.001) {
      v = v.toFixed(6);
    } else {
      v = v.toFixed(3);
    }
    return Number(v).toLocaleString();
  } else if (v === true) {
    return "True";
  } else if (v === false) {
    return "False";
  } else if ([undefined, null].includes(v)) {
    return "None";
  }
  return null;
};

const RENDERED_TYPES = new Set([
  BOOLEAN_FIELD,
  DATE_FIELD,
  DATE_TIME_FIELD,
  FLOAT_FIELD,
  FRAME_NUMBER_FIELD,
  FRAME_SUPPORT_FIELD,
  INT_FIELD,
  OBJECT_ID_FIELD,
  STRING_FIELD,
]);

const isRendered = (field) =>
  field &&
  (RENDERED_TYPES.has(field.ftype) || RENDERED_TYPES.has(field.subfield));

const isOfTypes = (
  field: { ftype: string; subfield?: string },
  types: string[]
) =>
  field &&
  types.some((type) => type === field.ftype || type === field.subfield);
