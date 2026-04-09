/**
 * Copyright 2017-2026, Voxel51, Inc.
 */
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
import type {
  Classification,
  Regression,
  TemporalDetectionLabel,
} from "../../overlays/classifications";
import { isValidColor, shouldShowLabelTag } from "../../overlays/util";
import type { BaseState, LabelTagColor, NONFINITE, Sample } from "../../state";
import { getBubbles, getField } from "./bubbles";
import { getAssignedColor } from "./util";

type Visibility = { values: string[]; exclude: boolean };

export interface TagData {
  color: string;
  title: string;
  path?: string;
  value: string;
}

type Renderer = (path: string, value: unknown) => TagData | null;
type Renderers = { [key: string]: Renderer };

export type ComputeTagDataInput = {
  activePaths: BaseState["options"]["activePaths"];
  attributeVisibility: BaseState["options"]["attributeVisibility"] & {
    _label_tags?: Visibility;
  };
  coloring: BaseState["options"]["coloring"];
  customizeColorSetting: BaseState["options"]["customizeColorSetting"];
  filter?: BaseState["options"]["filter"];
  fieldSchema: BaseState["config"]["fieldSchema"];
  labelTagColors: LabelTagColor;
  sample: Readonly<Sample> | Record<string, unknown>;
  selectedLabelTags?: BaseState["options"]["selectedLabelTags"];
  timeZone: BaseState["options"]["timeZone"];
};

export const computeTagData = ({
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
}: ComputeTagDataInput): TagData[] => {
  const elements: TagData[] = [];
  const currentFilter = filter ?? (() => true);

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
      const v = Array.isArray(value) ? value.join(", ") : value;
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

  const CLASSIFICATION_RENDERER = (path, param: Classification): TagData => {
    const label = param.label ?? "null";

    return {
      path,
      value: label,
      title: `${path}: ${label}`,
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
    path: string,
    param: TemporalDetectionLabel
  ): TagData | null => {
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

    const pathParts = path.split(".");
    const requestedField = pathParts[pathParts.length - 1];

    for (const [k, v] of Object.entries(values || {})) {
      if (k === "_cls" || k === "_id") {
        continue;
      }

      if (
        Object.prototype.hasOwnProperty.call(values, requestedField) &&
        k !== requestedField
      ) {
        continue;
      }

      const field = getField([...pathParts, k], fieldSchema);

      if (!field) {
        if (
          typeof v === "number" ||
          typeof v === "string" ||
          typeof v === "boolean"
        ) {
          results.push(String(v));
        }
        continue;
      }

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
      const sampleTags = (sample as { tags?: string[] }).tags;
      if (Array.isArray(sampleTags)) {
        for (const tag of sampleTags) {
          if (currentFilter(path, [tag])) {
            const valuePath = coloring.by !== "field" ? tag : "tags";
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
              path: valuePath,
            });
          }
        }
      }
    } else if (path === "_label_tags") {
      const labelTags = ((sample as { _label_tags?: unknown })._label_tags ??
        {}) as Record<string, number>;
      for (const [tag, count] of Object.entries(labelTags)) {
        const value = `${tag}: ${count}`;
        const valuePath = coloring.by !== "field" ? tag : path;
        if (shouldShowLabel(tag, attributeVisibility?._label_tags)) {
          elements.push({
            color: getAssignedColor({
              coloring,
              path,
              param: tag,
              labelTagColors,
              customizeColorSetting,
              isValidColor,
            }),
            path: valuePath,
            title: value,
            value,
          });
        }
      }
    } else {
      const [field, values] = getBubbles(path, sample, fieldSchema);

      if (field === null) {
        continue;
      }

      const pushList = (renderer: Renderer, value: unknown[]) => {
        let count = 0;
        let rest = 0;
        for (let listIndex = 0; listIndex < value?.length; listIndex++) {
          const result = renderer(path, value[listIndex]);

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
        currentFilter(path, values) &&
          pushList(LABEL_RENDERERS[field.embeddedDocType], values);
        continue;
      }

      if (
        field &&
        PRIMITIVE_RENDERERS[field.ftype] &&
        field.ftype !== LIST_FIELD
      ) {
        if (currentFilter(path, values)) {
          const toPush =
            field.ftype === FRAME_SUPPORT_FIELD ? [values] : values;
          pushList(PRIMITIVE_RENDERERS[field.ftype], toPush);
        }

        continue;
      }

      if (
        field &&
        field.ftype === LIST_FIELD &&
        PRIMITIVE_RENDERERS[field.subfield]
      ) {
        const visibleValue = [];
        if (values) {
          for (const value of values) {
            if (currentFilter(path, value)) {
              visibleValue.push(value);
            }
          }
        }

        pushList(PRIMITIVE_RENDERERS[field.subfield], visibleValue);
      }
    }
  }

  return elements.filter(Boolean);
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

const shouldShowLabel = (
  labelTag: string,
  visibility?: Visibility
): boolean => {
  if (!visibility) return true;

  const values = visibility.values;
  const exclude = visibility.exclude;

  const contains = values.includes(labelTag);
  return exclude ? !contains : contains;
};
