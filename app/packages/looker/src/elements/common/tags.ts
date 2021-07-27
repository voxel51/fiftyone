/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import { LABEL_LISTS } from "../../constants";
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

  createHTMLElement() {
    const container = document.createElement("div");
    container.classList.add(lookerTags);
    return container;
  }

  isShown({ thumbnail }: Readonly<State["config"]>) {
    return thumbnail;
  }

  renderSelf(
    { options: { filter, activePaths, colorMap } }: Readonly<State>,
    sample: Readonly<Sample>
  ) {
    if (arraysAreEqual(activePaths, this.activePaths)) {
      return this.element;
    }

    const container = document.createElement("div");
    container.classList.add(lookerTags);

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
      } else if (sample[path] && sample[path]._cls) {
        const cls = sample[path]._cls;

        if (cls in LABEL_LISTS) {
        }
      }
      return elements;
    }, []);

    this.activePaths = [...activePaths];

    elements.forEach(({ value, color, title }) => {
      const div = document.createElement("div");
      div.innerHTML = value;
      div.title = title;
      div.style.backgroundColor = color;
      container.appendChild(div);
    });

    this.element.isConnected && this.element.remove();
    this.element = container;

    return container;
  }
}

const arraysAreEqual = (a, b) => {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (a.length !== b.length) return false;

  for (var i = 0; i < a.length; ++i) {
    if (a[i] !== b[i]) return false;
  }
  return true;
};
