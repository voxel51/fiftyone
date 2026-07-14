/**
 * Copyright 2017-2026, Voxel51, Inc.
 */
import type { COLOR_BY } from "@fiftyone/utilities";
import { isEqual } from "lodash";
import type {
  BaseState,
  CustomizeColor,
  LabelTagColor,
  Sample,
} from "../../state";
import { BaseElement } from "../base";
import { computeTagData } from "./computeTagData";
import { lookerTags } from "./tags.module.css";
import { prettify } from "./util";

const LINE_HEIGHT_COEFFICIENT = 1.15;
const SPACING_COEFFICIENT = 0.1;

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
    sample: Readonly<Sample>,
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
    const elements = computeTagData({
      activePaths,
      attributeVisibility,
      coloring,
      customizeColorSetting,
      filter,
      fieldSchema,
      labelTagColors,
      sample,
      selectedLabelTags,
      timeZone,
    });

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
      }),
    );

    const spacing = `${fontSize * SPACING_COEFFICIENT}px`;
    for (const { path, value, color, title } of elements.filter((e) =>
      Boolean(e),
    )) {
      this.element.appendChild(
        applyTagValue(color, path, title, value, spacing),
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
        `${fontSize * LINE_HEIGHT_COEFFICIENT}px`,
      );
    }
  }
}

export const applyTagValue = (
  color: string,
  path: string | undefined,
  title: string,
  value: string,
  spacing: string,
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
  const pathValue = path ?? "undefined";
  const attribute = ["tags", "_label_tags"].includes(pathValue)
    ? `tag-${pathValue}-${tagValue}`
    : `tag-${pathValue}`;
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
      JSON.stringify(b[key]),
    );
    if (valueComparison !== 0) {
      return valueComparison;
    }
  }
  return 0;
}
