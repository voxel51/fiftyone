import { atomFamily, selector, selectorFamily } from "recoil";

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
import { sidebarGroupsDefinition } from "../components/Sidebar";

const RESERVED_FIELDS = [
  "id",
  "filepath",
  "_rand",
  "_media_type",
  "metadata",
  "tags",
  "frames",
];

export const schemaReduce = (schema: Schema, field: StrictField): Schema => {
  schema[field.name] = {
    ...field,
    fields: field.fields?.reduce(schemaReduce, {}),
  };
  return schema;
};

export const filterPaths = (paths: string[], schema: Schema): string[] => {
  return paths.filter((path) => {
    if (path.startsWith("tags.") || path.startsWith("_label_tags."))
      return true;

    const keys = path.split(".");
    let fields = schema;

    for (let j = 0; j < keys.length; j++) {
      if (!fields[keys[j]]) return false;
      fields = fields[keys[j]].fields;
    }

    return true;
  });
};

export const buildSchema = (dataset: State.Dataset): Schema => {
  const schema = dataset.sampleFields.reduce(schemaReduce, {});

  if (dataset.frameFields && dataset.frameFields.length) {
    schema.frames = {
      ftype: LIST_FIELD,
      name: "frames",
      fields: dataset.frameFields.reduce(schemaReduce, {}),
      dbField: null,
      embeddedDocType: null,
      subfield: "Frame",
    };
  }

  return schema;
};

const fieldFilter = (
  fields: Schema,
  view: State.Stage[],
  space: State.SPACE
) => {
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
};

export const fieldSchema = selectorFamily<
  Schema,
  { space: State.SPACE; filtered?: boolean }
>({
  key: "fieldSchema",
  get: ({ space, filtered }) => ({ get }) => {
    const dataset = get(atoms.dataset);

    if (!dataset) {
      return {};
    }

    const fields = (space === State.SPACE.FRAME
      ? dataset.frameFields
      : dataset.sampleFields
    ).reduce(schemaReduce, {});

    filtered && fieldFilter(fields, get(viewAtoms.view), space);

    return fields;
  },
});

export const pathIsShown = selectorFamily<boolean, string>({
  key: "pathIsShown",
  get: (path) => ({ get }) => {
    if (path.startsWith("tags.") || path.startsWith("_label_tags.")) {
      return true;
    }

    let keys = path.split(".");
    let schema = get(
      fieldSchema({ space: State.SPACE.SAMPLE, filtered: true })
    );

    if (keys[0] === "frames" && !(keys[0] in schema)) {
      schema = get(fieldSchema({ space: State.SPACE.FRAME, filtered: true }));
      keys = keys.slice(1);
    }

    if (!keys.length) {
      return false;
    }

    for (const key of keys) {
      if (!(key in schema)) {
        return false;
      }

      schema = schema[key].fields;
    }

    return true;
  },
});

export const fullSchema = selector<Schema>({
  key: "fullSchema",
  get: ({ get }) => {
    const schema = get(fieldSchema({ space: State.SPACE.SAMPLE }));

    const frames = get(fieldSchema({ space: State.SPACE.FRAME }));

    if (Boolean(Object.keys(frames).length)) {
      return {
        ...schema,
        frames: {
          ftype: LIST_FIELD,
          name: "frames",
          fields: frames,
          embeddedDocType: null,
          subfield: "Frame",
          dbField: null,
        },
      } as Schema;
    }

    return schema;
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

    const sampleLabels = Object.keys(
      get(fieldSchema({ space: State.SPACE.SAMPLE, filtered: true }))
    )
      .filter((l) => !l.startsWith("_"))
      .sort();
    const frameLabels = Object.keys(
      get(fieldSchema({ space: State.SPACE.FRAME, filtered: true }))
    )
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

    const fieldValue = get(field(path));

    if (!fieldValue) {
      return [];
    }

    return Object.entries(fieldValue.fields)
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
    if (!params.path && !params.space) {
      throw new Error("invalid parameters");
    }

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
      let schema = get(fieldSchema({ space: State.SPACE.FRAME }));
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
    let schema = get(fieldSchema({ space: State.SPACE.SAMPLE }));
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
    const data = get(field(path));

    if (!data) {
      return path;
    }

    const { embeddedDocType } = data;

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

const _activeFields = atomFamily<string[], { modal: boolean }>({
  key: "_activeFields",
  default: ({ modal }) => labelFields({}),
});

export const activeFields = selectorFamily<string[], { modal: boolean }>({
  key: "activeFields",
  get: ({ modal }) => ({ get }) => {
    return filterPaths(
      get(_activeFields({ modal })),
      buildSchema(get(atoms.dataset))
    );
  },
  set: ({ modal }) => ({ set }, value) => {
    set(_activeFields({ modal }), value);
  },
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
  get: ({ modal }) => ({ get }) => {
    const active = new Set(get(activeFields({ modal })));
    return get(labelFields({})).filter((field) => active.has(field));
  },
});

export const activeLabelPaths = selectorFamily<
  string[],
  { modal: boolean; space?: State.SPACE }
>({
  key: "activeLabelPaths",
  get: ({ modal, space }) => ({ get }) => {
    const active = new Set(get(activeFields({ modal })));
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

    if (!fieldValue) {
      return false;
    }

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
