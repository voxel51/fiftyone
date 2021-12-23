import React from "react";
import { RecoilValueReadOnly, selectorFamily } from "recoil";

import {
  BOOLEAN_FIELD,
  FLOAT_FIELD,
  INT_FIELD,
  LABELS,
  OBJECT_ID_FIELD,
  STRING_FIELD,
} from "@fiftyone/utilities";

import * as schemaAtoms from "../../recoil/schema";

import { filter as boolean } from "./booleanState";
import { filter as string } from "./stringState";
import { filter as numeric } from "./numericState";

import BooleanFieldFilter from "./BooleanFieldFilter";
import NumericFieldFilter from "./NumericFieldFilter";
import StringFieldFilter from "./StringFieldFilter";

export { BooleanFieldFilter, NumericFieldFilter, StringFieldFilter };

export const pathFilter = selectorFamily<
  (value: any) => boolean,
  { modal: boolean; path: string }
>({
  key: "pathFilter",
  get: ({ path, modal }) => ({ get }) => {
    let { ftype, embeddedDocType } = get(schemaAtoms.field(path));

    if (LABELS.includes(embeddedDocType)) {
      const expandedPath = get(schemaAtoms.expandPath(path));
      const labelFields = get(schemaAtoms.fields({ path: expandedPath }));

      const resolve = (name, value) =>
        (get(pathFilter({ modal, path: `${expandedPath}.${name}` })) as (
          value: any
        ) => boolean)(value);
      return (value: any) => {
        return labelFields.every(({ name }) => resolve(name, value));
      };
    }

    switch (ftype) {
      case BOOLEAN_FIELD:
        return get(boolean({ modal, path }));
      case INT_FIELD:
        return get(numeric({ modal, path }));
      case FLOAT_FIELD:
        return get(numeric({ modal, path }));
      case OBJECT_ID_FIELD:
        return get(string({ modal, path }));
      case STRING_FIELD:
        return get(string({ modal, path }));
      default:
        throw new Error("unresolved path filter");
    }
  },
}) as (param: {
  modal: boolean;
  path: string;
}) => RecoilValueReadOnly<(value: any) => boolean>;
