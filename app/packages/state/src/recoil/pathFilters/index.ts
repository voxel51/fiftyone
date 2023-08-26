import {
  BOOLEAN_FIELD,
  DATE_FIELD,
  DATE_TIME_FIELD,
  FLOAT_FIELD,
  FRAME_NUMBER_FIELD,
  FRAME_SUPPORT_FIELD,
  INT_FIELD,
  LABELS,
  LIST_FIELD,
  OBJECT_ID_FIELD,
  STRING_FIELD,
  VALID_PRIMITIVE_TYPES,
} from "@fiftyone/utilities";
import { selectorFamily } from "recoil";

import { filters, modalFilters } from "../filters";

import {
  attributeVisibility,
  modalAttributeVisibility,
} from "../attributeVisibility";
import * as schemaAtoms from "../schema";
import * as selectors from "../selectors";
import { State } from "../types";
import { boolean, listBoolean } from "./boolean";
import { listNumber, numeric } from "./numeric";
import { listString, string } from "./string";
export * from "./boolean";
export * from "./numeric";
export * from "./string";
const primitiveFilter = selectorFamily<
  (value: any) => boolean,
  { modal: boolean; path: string }
>({
  key: "primitiveFilter",
  get:
    ({ modal, path }) =>
    ({ get }) => {
      const { ftype, subfield } = get(schemaAtoms.field(path));

      if (ftype === BOOLEAN_FIELD) {
        return get(boolean({ modal, path }));
      }

      if (
        [
          FLOAT_FIELD,
          FRAME_NUMBER_FIELD,
          FRAME_SUPPORT_FIELD,
          INT_FIELD,
          DATE_FIELD,
          DATE_TIME_FIELD,
        ].includes(ftype)
      ) {
        return get(numeric({ modal, path }));
      }

      if ([OBJECT_ID_FIELD, STRING_FIELD].includes(ftype)) {
        return get(string({ modal, path }));
      }

      if (
        [LIST_FIELD].includes(ftype) &&
        [OBJECT_ID_FIELD, STRING_FIELD].includes(subfield)
      ) {
        return get(listString({ modal, path }));
      }

      if ([LIST_FIELD].includes(ftype) && [BOOLEAN_FIELD].includes(subfield)) {
        return get(listBoolean({ modal, path }));
      }

      if (
        [LIST_FIELD].includes(ftype) &&
        [INT_FIELD, FLOAT_FIELD, DATE_FIELD, DATE_TIME_FIELD].includes(subfield)
      ) {
        return get(listNumber({ modal, path }));
      }

      return (value) => true;
    },
  cachePolicy_UNSTABLE: {
    eviction: "most-recent",
  },
});

export type PathFilterSelector = (path: string, value: unknown) => boolean;
export const pathFilter = selectorFamily<PathFilterSelector, boolean>({
  key: "pathFilter",
  get:
    (modal) =>
    ({ get }) => {
      const paths = get(schemaAtoms.activeFields({ modal }));
      const hidden = get(selectors.hiddenLabelIds);

      const currentFilter = modal ? get(modalFilters) : get(filters);
      const currentVisibility = modal
        ? get(modalAttributeVisibility)
        : get(attributeVisibility);

      const newFilters = paths.reduce((f, path) => {
        if (path.startsWith("_")) return f;

        const field = get(schemaAtoms.field(path));
        const isKeypoints = path.includes("keypoints");

        if (field && LABELS.includes(field.embeddedDocType)) {
          const expandedPath = get(schemaAtoms.expandPath(path));
          const labelFields = get(
            schemaAtoms.fields({
              path: expandedPath,
              ftype: VALID_PRIMITIVE_TYPES,
            })
          );

          const fs = labelFields.map(({ name, dbField }) => {
            const filter = get(
              primitiveFilter({ modal, path: `${expandedPath}.${name}` })
            );

            return (value: unknown) => {
              if (isKeypoints && typeof value[name] === "object") {
                // keypoints ListFields
                return () => true;
              }

              const correctedValue = value[0] ? value[0] : value;
              return filter(
                correctedValue[name === "id" ? "id" : dbField || name]
              );
            };
          });

          f[path] = (value: unknown) => {
            const correctedValue = value[0] ? value[0] : value;
            if (hidden.has(value.id)) {
              return false;
            }

            return (
              matchesLabelTags(
                correctedValue as { tags: string[] },
                currentFilter?._label_tags,
                currentVisibility?._label_tags
              ) &&
              fs.every((filter) => {
                return filter(correctedValue);
              })
            );
          };
        } else if (field) {
          f[path] = get(primitiveFilter({ modal, path }));
        }

        return f;
      }, {});

      return (path, value) => {
        if (!newFilters[path]) {
          return false;
        }

        return newFilters[path](value);
      };
    },
  cachePolicy_UNSTABLE: {
    eviction: "most-recent",
  },
});

const matchesLabelTags = (
  value: {
    tags: string[];
  },
  filter?: State.CategoricalFilter<string>,
  visibility?: State.CategoricalFilter<string>
) => {
  // in either visibility or filter is set
  if (!filter && !visibility) {
    return true;
  }
  // if only visibility is set
  if (!filter && visibility) {
    const { values, exclude } = visibility;

    const contains = value.tags?.some((tag) => values.includes(tag));
    return exclude ? !contains : contains;
  }

  // if only filter is set
  if (filter && !visibility) {
    const { isMatching, values, exclude } = filter;

    if (isMatching) {
      return true;
    }

    const contains = value.tags?.some((tag) => values.includes(tag));
    return exclude ? !contains : contains;
  }

  // if both visibility and filter are set
  if (filter && visibility) {
    const { isMatching, values, exclude } = filter;
    const { values: vValues, exclude: vExclude } = visibility;

    if (isMatching) {
      const contains = value.tags?.some((tag) => vValues.includes(tag));
      return vExclude ? !contains : contains;
    }
    const vContains = value.tags?.some((tag) => vValues.includes(tag));
    const vResult = vExclude ? !vContains : vContains;
    const fContains = value.tags?.some((tag) => values.includes(tag));
    const fResult = exclude ? !fContains : fContains;
    return vResult && fResult;
  }

  return true;
};
