import { atom, atomFamily, selector, selectorFamily } from "recoil";

import { RESERVED_FIELDS, VALID_LABEL_TYPES } from "../utils/labels";

import * as atoms from "./atoms";
import * as selectors from "./selectors";
import { State } from "./types";

const schemaReduce = (
  schema: State.Schema,
  field: State.Field
): State.Schema => {
  schema[field.name] = field;
  return schema;
};

export const fieldSchema = selectorFamily<State.Schema, State.SPACE>({
  key: "fieldSchema",
  get: (space) => ({ get }) => {
    const state = get(atoms.stateDescription);

    if (!state.dataset) {
      return {};
    }

    const fields = (space === State.SPACE.FRAME
      ? state.dataset.frameFields
      : state.dataset.sampleFields
    ).reduce(schemaReduce, {});

    const view = get(selectors.view);
    view.forEach(({ _cls, kwargs }) => {
      if (_cls === "fiftyone.core.stages.SelectFields") {
        const supplied = kwargs[0][1] ? kwargs[0][1] : [];
        let names = new Set([...(supplied as []), ...RESERVED_FIELDS]);
        if (space === State.SPACE.FRAME) {
          names = new Set(
            Array.from(names).map((n) => n.slice("frames.".length))
          );
        }
        Object.keys(fields).forEach((f) => {
          if (!names.has(f)) {
            delete fields[f];
          }
        });
      } else if (_cls === "fiftyone.core.stages.ExcludeFields") {
        const supplied = kwargs[0][1] ? kwargs[0][1] : [];
        let names = Array.from(supplied as string[]);

        if (space === State.SPACE.FRAME) {
          names = names.map((n) => n.slice("frames.".length));
        }
        names.forEach((n) => {
          delete fields[n];
        });
      }
    });
    return fields;
  },
});

export const fieldPaths = selector<string[]>({
  key: "fieldPaths",
  get: ({ get }) => {
    const sampleLabels = get(fieldSchema(State.SPACE.SAMPLE));
    const frameLabels = get(fieldSchema(State.SPACE.FRAME));
    return Object.keys(sampleLabels)
      .concat(Object.keys(frameLabels).map((l) => "frames." + l))
      .sort();
  },
});

export const labelFieldNames = selectorFamily<string[], State.SPACE>({
  key: "labelFieldNames",
  get: (space) => ({ get }) => {
    const schema = get(fieldSchema(space));

    return Object.entries(schema)
      .filter(([name, field]) => {
        if (!field.embeddedDocType) {
          return false;
        }

        return VALID_LABEL_TYPES.includes(
          field.embeddedDocType.split(".").slice(-1)[0]
        );
      })
      .map(([name]) => name)
      .sort();
  },
});

export const labelPaths = selector<string[]>({
  key: "labelPaths",
  get: ({ get }) => {
    const sampleLabels = get(labelFieldNames(State.SPACE.SAMPLE));
    const frameLabels = get(labelFieldNames(State.SPACE.FRAME));
    return sampleLabels.concat(frameLabels.map((l) => "frames." + l)).sort();
  },
});

export const activeFields = atomFamily<string[], boolean>({
  key: "activeFields",
  default: labelPaths,
});
