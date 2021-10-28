import { atom, atomFamily, selector, selectorFamily } from "recoil";

import {
  LABEL_LIST,
  RESERVED_FIELDS,
  VALID_LABEL_TYPES,
  VALID_LIST_TYPES,
} from "../utils/labels";

import * as atoms from "./atoms";
import { State } from "./types";
import * as viewAtoms from "./view";

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

    const view = get(viewAtoms.view);
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

export const field = selectorFamily<State.Field, string>({
  key: "field",
  get: (path) => ({ get }) => {
    if (path.startsWith("frames.")) {
      const framePath = path.slice("frames.".length);

      let field: State.Field = null;
      let schema = get(fieldSchema(State.SPACE.FRAME));
      for (const name in framePath.split(".")) {
        field = schema[name];
        if (!field) {
          break;
        }

        schema = field.fields;
      }

      if (field) {
        return field;
      }
    }

    let field: State.Field = null;
    let schema = get(fieldSchema(State.SPACE.SAMPLE));
    for (const name in path.split(".")) {
      field = schema[name];
      schema = field.fields;
    }

    return field;
  },
});

export const labelFields = selector<string[]>({
  key: "labelFieldNames",
  get: ({ get }) => {
    const paths = get(fieldPaths);

    return paths.filter((path) =>
      VALID_LABEL_TYPES.includes(get(field(path)).embeddedDocType)
    );
  },
});

export const labelPaths = selector<string[]>({
  key: "labelPaths",
  get: ({ get }) => {
    const fields = get(labelFields);
    return fields.map((path) => {
      const labelField = get(field(path));

      const typePath = labelField.embeddedDocType.split(".");
      const type = typePath[typePath.length - 1];

      if (type in LABEL_LIST) {
        return `${path}.${LABEL_LIST[type]}`;
      }

      return path;
    });
  },
});

export const activeFields = atomFamily<string[], boolean>({
  key: "activeFields",
  default: labelFields,
});

export const activeLabelFields = selectorFamily<string[], boolean>({
  key: "activeLabelFields",
  get: (modal) => ({ get }) => {
    const active = new Set(get(activeFields(modal)));
    return get(labelFields).filter((field) => active.has(field));
  },
});
