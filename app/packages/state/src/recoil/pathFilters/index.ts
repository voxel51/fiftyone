import {
  BOOLEAN_FIELD,
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
import { matchedTags } from "../filters";

import * as schemaAtoms from "../schema";
import * as selectors from "../selectors";
import { State } from "../types";
import { boolean } from "./boolean";
import { numeric } from "./numeric";
import { string, listString } from "./string";

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
      const { ftype } = get(schemaAtoms.field(path));
      if (ftype === BOOLEAN_FIELD) {
        return get(boolean({ modal, path }));
      }

      if (
        [
          FLOAT_FIELD,
          FRAME_NUMBER_FIELD,
          FRAME_SUPPORT_FIELD,
          INT_FIELD,
        ].includes(ftype)
      ) {
        return get(numeric({ modal, path }));
      }

      if ([OBJECT_ID_FIELD, STRING_FIELD].includes(ftype)) {
        return get(string({ modal, path }));
      }

      if ([LIST_FIELD].includes(ftype)) {
        return get(listString({ modal, path}));
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
      const matchedLabelTags = get(
        matchedTags({ key: State.TagKey.LABEL, modal })
      );

      const filters = paths.reduce((f, path) => {
        if (path.startsWith("_")) return f;

        const field = get(schemaAtoms.field(path));

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

            return (value: unknown) =>
              filter(value[name === "id" ? "id" : dbField || name]);
          });

          f[path] = (value: unknown) => {
            if (hidden.has(value.id)) {
              return false;
            }

            let matched = true;
            if (matchedLabelTags.size) {
              matched =
                value.tags &&
                value.tags.some((tag) => matchedLabelTags.has(tag));
            }

            return matched && fs.every((filter) => filter(value));
          };
        } else if (field) {
          f[path] = get(primitiveFilter({ modal, path }));
        }

        return f;
      }, {});

      return (path, value) => {
        if (!filters[path]) {
          return false;
        }

        return filters[path](value);
      };
    },
  cachePolicy_UNSTABLE: {
    eviction: "most-recent",
  },
});
