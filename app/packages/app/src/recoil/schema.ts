import { atomFamily, selectorFamily } from "recoil";

import * as atoms from "./atoms";
import {
  LABELS_PATH,
  LABEL_LIST,
  RESERVED_FIELDS,
  VALID_LABEL_TYPES,
  withPath,
} from "./constants";
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

export const fieldPaths = selectorFamily<string[], { space?: State.SPACE }>({
  key: "fieldPaths",
  get: ({ space }) => ({ get }) => {
    const sampleLabels = Object.keys(
      get(fieldSchema(State.SPACE.SAMPLE))
    ).sort();
    const frameLabels = Object.keys(get(fieldSchema(State.SPACE.FRAME)))
      .map((l) => "frames." + l)
      .sort();

    if (space === State.SPACE.SAMPLE) {
      return sampleLabels;
    }

    if (space === State.SPACE.FRAME) {
      return frameLabels;
    }

    if (!space) {
      return sampleLabels.concat(frameLabels).sort();
    }

    throw new Error("invalid parameters");
  },
});

export const field = selectorFamily<State.Field, string>({
  key: "field",
  get: (path) => ({ get }) => {
    if (path.startsWith("frames.")) {
      const framePath = path.slice("frames.".length);

      let field: State.Field = null;
      let schema = get(fieldSchema(State.SPACE.FRAME));
      for (const name of framePath.split(".")) {
        if (schema[name]) {
          field = schema[name];
          schema = field.fields;
        }
      }

      if (field) {
        return field;
      }
    }

    let field: State.Field = null;
    let schema = get(fieldSchema(State.SPACE.SAMPLE));
    for (const name of path.split(".")) {
      if (schema[name]) {
        field = schema[name];
        schema = field.fields;
      }
    }

    return field;
  },
});

export const labelFields = selectorFamily<string[], { space?: State.SPACE }>({
  key: "labelFields",
  get: (params) => ({ get }) => {
    const paths = get(fieldPaths(params));
    const types = withPath(LABELS_PATH, VALID_LABEL_TYPES);

    return paths.filter((path) =>
      types.includes(get(field(path)).embeddedDocType)
    );
  },
});

export const labelPaths = selectorFamily<string[], { space?: State.SPACE }>({
  key: "labelPaths",
  get: (params) => ({ get }) => {
    const fields = get(labelFields(params));
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

export const labelPath = selectorFamily<string, string>({
  key: "labelPath",
  get: (path) => ({ get }) => {
    const labelField = get(field(path));

    const typePath = labelField.embeddedDocType.split(".");
    const type = typePath[typePath.length - 1];

    if (type in LABEL_LIST) {
      return `${path}.${LABEL_LIST[type]}`;
    }

    return path;
  },
});

export const activeFields = atomFamily<
  string[],
  { modal: boolean; space?: State.SPACE }
>({
  key: "activeFields",
  default: ({ modal, space }) => labelFields({ space }),
});

export const activeField = selectorFamily<
  boolean,
  { modal: boolean; path: string }
>({
  key: "activeField",
  get: ({ modal, path }) => ({ get }) =>
    get(activeFields({ modal })).includes(path),

  set: ({ modal, path }) => ({ get, set }, active) => {
    const fields = get(activeFields({ modal }));
    set(
      activeFields({ modal }),
      active ? [path, ...fields] : fields.filter((field) => field !== path)
    );
  },
});

export const activeTags = selectorFamily<string[], boolean>({
  key: "activeTags",
  get: (modal) => ({ get }) => {
    return get(activeFields({ modal }))
      .filter((t) => t.startsWith("tags."))
      .map((t) => t.slice(5));
  },
  set: (modal) => ({ get, set }, value) => {
    if (Array.isArray(value)) {
      const tags = value.map((v) => "tags." + v);
      const prevActiveTags = get(activeTags(modal));
      let active = get(activeFields({ modal })).filter((v) =>
        v.startsWith("tags.") ? tags.includes(v) : true
      );
      if (tags.length && prevActiveTags.length < tags.length) {
        active = [tags[0], ...active.filter((v) => v !== tags[0])];
      }
      set(activeFields({ modal }), active);
    }
  },
});

export const activeLabelTags = selectorFamily<string[], boolean>({
  key: "activeLabelTags",
  get: (modal) => ({ get }) => {
    return get(activeFields({ modal }))
      .filter((t) => t.startsWith("_label_tags."))
      .map((t) => t.slice("_label_tags.".length));
  },
  set: (modal) => ({ get, set }, value) => {
    if (Array.isArray(value)) {
      const tags = value.map((v) => "_label_tags." + v);
      const prevActiveTags = get(activeLabelTags(modal));
      let active = get(activeFields({ modal })).filter((v) =>
        v.startsWith("_label_tags.") ? tags.includes(v) : true
      );
      if (tags.length && prevActiveTags.length < tags.length) {
        active = [tags[0], ...active.filter((v) => v !== tags[0])];
      }
      set(activeFields({ modal }), active);
    }
  },
});

export const activeLabelFields = selectorFamily<
  string[],
  { modal: boolean; space?: State.SPACE }
>({
  key: "activeLabelFields",
  get: ({ modal, space }) => ({ get }) => {
    const active = new Set(get(activeFields({ modal, space })));
    return get(labelFields({ space })).filter((field) => active.has(field));
  },
});

export const activeLabelPaths = selectorFamily<
  string[],
  { modal: boolean; space?: State.SPACE }
>({
  key: "activeLabelPaths",
  get: ({ modal, space }) => ({ get }) => {
    const active = new Set(get(activeFields({ modal, space })));
    return get(labelFields({}))
      .filter((field) => active.has(field))
      .map((field) => get(labelPath(field)));
  },
});

export const meetsType = selectorFamily<
  boolean,
  {
    path: string;
    ftype: string | string[];
    embeddedDocType?: string | string[];
  }
>({
  key: "meetsType",
  get: ({ path, ftype, embeddedDocType }) => ({ get }) => {
    const fieldValue = get(field(path));

    if (!Array.isArray(ftype)) {
      ftype = [ftype];
    }

    if (!Array.isArray(embeddedDocType)) {
      embeddedDocType = [embeddedDocType];
    }

    if (
      ftype.some((f) => fieldValue.ftype === f || fieldValue.subfield === f)
    ) {
      return embeddedDocType.some(
        (doc) => fieldValue.embeddedDocType === doc || !doc
      );
    }

    return false;
  },
});
