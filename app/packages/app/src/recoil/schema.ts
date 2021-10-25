import { selectorFamily } from "recoil";

import * as atoms from "./atoms";
import { State } from "./types";

const schemaReduce = (
  schema: State.Schema,
  field: State.Field
): State.Schema => {
  schema[field.name] = field;
  return schema;
};

export const sampleSchema = selectorFamily<State.Schema, State.SPACE>({
  key: "sampleSchema",
  get: (space) => ({ get }) => {
    const state = get(atoms.stateDescription);

    if (!state.dataset) {
      return {};
    }

    const fields =
      space === State.SPACE.FRAME
        ? state.dataset.frameFields
        : state.dataset.sampleFields;

    return fields.reduce(schemaReduce, {});
  },
});
