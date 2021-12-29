import { atomFamily, selectorFamily } from "recoil";

import {
  Field,
  LABELS,
  LABELS_PATH,
  LABEL_LIST,
  LABEL_LISTS,
  LIST_FIELD,
  meetsFieldType,
  Schema,
  StrictField,
  withPath,
} from "@fiftyone/utilities";

import * as atoms from "./atoms";
import { State } from "./types";
import * as viewAtoms from "./view";

const RESERVED_FIELDS = [
  "_id",
  "_rand",
  "_media_type",
  "metadata",
  "tags",
  "frames",
];

const schemaReduce = (schema: Schema, field: StrictField): Schema => {
  schema[field.name] = {
    ...field,
    fields: field.fields.reduce(schemaReduce, {}),
  };
  return schema;
};

export const fieldSchema = selectorFamily<Schema, State.SPACE>({
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

export const fieldPaths = selectorFamily<
  string[],
  {
    path?: string;
    space?: State.SPACE;
    ftype?: string | string[];
    embeddedDocType?: string | string[];
  }
>({
  key: "fieldPaths",
  get: ({ path, space, ftype, embeddedDocType }) => ({ get }) => {
    if (path && space) {
      throw new Error("path and space provided");
    }

    const sampleLabels = Object.keys(get(fieldSchema(State.SPACE.SAMPLE)))
      .filter((l) => !l.startsWith("_"))
      .sort();
    const frameLabels = Object.keys(get(fieldSchema(State.SPACE.FRAME)))
      .filter((l) => !l.startsWith("_"))
      .map((l) => "frames." + l)
      .sort();

    const f = (paths) =>
      paths.filter(
        (p) => !ftype || get(meetsType({ path: p, ftype, embeddedDocType }))
      );

    if (space === State.SPACE.SAMPLE) {
      return f(sampleLabels);
    }

    if (space === State.SPACE.FRAME) {
      return f(frameLabels);
    }

    if (!space && !path) {
      return f(sampleLabels.concat(frameLabels).sort());
    }

    return Object.entries(get(field(path)).fields)
      .filter(
        ([_, field]) =>
          !ftype || meetsFieldType(field, { ftype, embeddedDocType })
      )
      .map(([name]) => name);
  },
});

export const fields = selectorFamily<
  Field[],
  {
    path?: string;
    space?: State.SPACE;
    ftype?: string | string[];
    embeddedDocType?: string | string[];
  }
>({
  key: "fields",
  get: (params) => ({ get }) => {
    return [...get(fieldPaths(params))]
      .sort()
      .map((name) =>
        get(field(params.path ? [params.path, name].join(".") : name))
      );
  },
});

export const field = selectorFamily<Field, string>({
  key: "field",
  get: (path) => ({ get }) => {
    if (path.startsWith("frames.")) {
      const framePath = path.slice("frames.".length);

      let field: Field = null;
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

    let field: Field = null;
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

    return paths.filter((path) =>
      LABELS.includes(get(field(path)).embeddedDocType)
    );
  },
});

export const labelPaths = selectorFamily<
  string[],
  { space?: State.SPACE; expanded?: boolean }
>({
  key: "labelPaths",
  get: ({ expanded = true, ...params }) => ({ get }) => {
    const fields = get(labelFields(params));
    return fields.map((path) => {
      const labelField = get(field(path));

      const typePath = labelField.embeddedDocType.split(".");
      const type = typePath[typePath.length - 1];

      if (expanded && type in LABEL_LIST) {
        return `${path}.${LABEL_LIST[type]}`;
      }

      return path;
    });
  },
});

export const expandPath = selectorFamily<string, string>({
  key: "expandPath",
  get: (path) => ({ get }) => {
    const { embeddedDocType } = get(field(path));

    if (withPath(LABELS_PATH, LABEL_LISTS).includes(embeddedDocType)) {
      const typePath = embeddedDocType.split(".");
      const type = typePath[typePath.length - 1];
      return `${path}.${LABEL_LIST[type]}`;
    }

    return path;
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
    acceptLists?: boolean;
    under?: boolean;
  }
>({
  key: "meetsType",
  get: ({
    path,
    ftype,
    embeddedDocType,
    acceptLists = true,
    under = false,
  }) => ({ get }) => {
    if (!under && path.startsWith("_")) {
      return false;
    }

    const fieldValue = get(field(path));

    return meetsFieldType(fieldValue, { ftype, embeddedDocType, acceptLists });
  },
});

export const fieldType = selectorFamily<
  string,
  { path: string; useListSubfield?: boolean }
>({
  key: "fieldType",
  get: ({ path, useListSubfield = true }) => ({ get }) => {
    const { ftype, subfield } = get(field(path));
    if (useListSubfield && ftype === LIST_FIELD) {
      return subfield;
    }

    return ftype;
  },
});
