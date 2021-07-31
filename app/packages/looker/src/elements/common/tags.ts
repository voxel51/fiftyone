/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import {
  CLASSIFICATIONS,
  LABEL_LISTS,
  LABEL_TAGS_CLASSES,
} from "../../constants";
import { BaseState, Sample } from "../../state";
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
      options: { filter, activePaths, colorMap, colorByLabel, fieldsMap },
    }: Readonly<State>,
    sample: Readonly<Sample>
  ) {
    if (
      arraysAreEqual(activePaths, this.activePaths) &&
      this.colorByValue === colorByLabel
    ) {
      return this.element;
    }

    const elements = activePaths.reduce<TagData[]>((elements, path) => {
      if (
        path.startsWith("tags.") &&
        Array.isArray(sample.tags) &&
        sample.tags.includes(path.slice(5))
      ) {
        const tag = path.slice(5);
        elements.push({
          color: colorMap(path),
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
              color: colorMap(path),
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

        const labels =
          cls === CLASSIFICATIONS
            ? sample[path][LABEL_LISTS[cls]]
            : [sample[path]];

        elements = [
          ...elements,
          ...labels
            .filter((label) => filter[path](label))
            .map((label) => label.label)
            .map((label) => ({
              color: colorMap(colorByLabel ? label : path),
              title: `${path}: ${label}`,
              value: label,
            })),
        ];
      } else if (fieldsMap && sample[fieldsMap[path] || path]) {
        const value = sample[fieldsMap[path] || path];
        if (["boolean", "number", "string"].includes(typeof value)) {
          const pretty = prettify(value);
          elements = [
            ...elements,
            {
              color: colorMap(colorByLabel ? value : path),
              title: value,
              value: pretty,
            },
          ];
        }
      }
      this.colorByValue = colorByLabel;
      return elements;
    }, []);

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
    return Number(v.toFixed(3)).toLocaleString();
  } else if (v === true) {
    return "True";
  } else if (v === false) {
    return "False";
  } else if ([undefined, null].includes(v)) {
    return "None";
  }
  return null;
};
