import React, { useState } from "react";
import { selector, useRecoilValue } from "recoil";
import {
  EMBEDDED_DOCUMENT_FIELD,
  LIST_FIELD,
  VALID_SCALAR_TYPES,
} from "../../recoil/constants";

import * as schemaAtoms from "../../recoil/schema";
import { State } from "../../recoil/types";
import { TextEntry } from "./Entries";
import { FieldHeader } from "./utils";

const isSupported = ({ ftype, embeddedDocType, subfield }: State.Field) => {
  if (ftype === LIST_FIELD) {
    ftype = subfield;
  }

  if (ftype === EMBEDDED_DOCUMENT_FIELD && embeddedDocType) {
    return true;
  }

  if (VALID_SCALAR_TYPES.includes(ftype)) {
    return true;
  }

  return false;
};

const unsupportedFields = selector<string[]>({
  key: "unsupportedFields",
  get: ({ get }) => {
    const fields = get(schemaAtoms.fieldSchema(State.SPACE.SAMPLE));
    const frameFields = get(schemaAtoms.fieldSchema(State.SPACE.FRAME));

    const paths = [];

    for (const name in fields) {
      if (isSupported(fields[name])) continue;
      paths.push(name);
    }

    for (const name in frameFields) {
      if (isSupported(fields[name])) continue;
      paths.push(`frames.${name}`);
    }

    return paths.sort();
  },
});
