import { selector } from "recoil";

import { toCamelCase } from "@fiftyone/utilities";

import * as atoms from "./atoms";

interface Field {
  ftype: string;
  dbField: string;
  name: string;
  documentType: string;
  subfield: string;
  fields: {
    [key: string]: Field;
  };
}

interface Schema {
  [key: string]: Field;
}

const schema = selector<Schema>({
  key: "schema",
  get: ({ get }) => {
    const state = get(atoms.stateDescription);
    const doc = toCamelCase(state.dataset);

    console.log(doc);
  },
});
