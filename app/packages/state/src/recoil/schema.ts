import {
  atomFamily,
  RecoilState,
  RecoilValueReadOnly,
  selector,
  selectorFamily,
} from "recoil";

import {
  DETECTION,
  DETECTIONS,
  EMBEDDED_DOCUMENT_FIELD,
  Field,
  LABELS,
  LABELS_PATH,
  LABEL_LIST,
  LABEL_LISTS,
  LIST_FIELD,
  meetsFieldType,
  Schema,
  StrictField,
  VALID_PRIMITIVE_TYPES,
  withPath,
} from "@fiftyone/utilities";

import * as atoms from "./atoms";
import { State } from "./types";
import _ from "lodash";
import { Sample } from "@fiftyone/looker/src/state";

export const schemaReduce = (schema: Schema, field: StrictField): Schema => {
  schema[field.name] = {
    ...field,
    fields: field.fields?.reduce(schemaReduce, {}),
  };
  return schema;
};

export const filterPaths = (
  paths: string[] | null,
  schema: Schema
): string[] => {
  return paths
    ? paths.filter((path) => {
        if (path === "_label_tags") return true;

        const keys = path.split(".");
        let fields = schema;

        for (let j = 0; j < keys.length; j++) {
          if (!fields[keys[j]]) return false;
          fields = fields[keys[j]].fields;
        }

        return true;
      })
    : [];
};

export const buildSchema = (dataset: State.Dataset): Schema => {
  const schema = dataset.sampleFields.reduce(schemaReduce, {});

  if (dataset.frameFields && dataset.frameFields.length) {
    schema.frames = {
      ftype: LIST_FIELD,
      name: "frames",
      fields: dataset.frameFields.reduce(schemaReduce, {}),
      dbField: null,
      description: null,
      info: null,
      embeddedDocType: null,
      subfield: "Frame",
    };
  }

  return schema;
};

export const fieldSchema = selectorFamily<Schema, { space: State.SPACE }>({
  key: "fieldSchema",
  get:
    ({ space }) =>
    ({ get }) => {
      const dataset = get(atoms.dataset);

      if (!dataset) {
        return {};
      }

      const fields = (
        space === State.SPACE.FRAME ? dataset.frameFields : dataset.sampleFields
      ).reduce(schemaReduce, {});

      return fields;
    },
});

export const pathIsShown = selectorFamily<boolean, string>({
  key: "pathIsShown",
  get:
    (path) =>
    ({ get }) => {
      if (path.startsWith("tags.") || path.startsWith("_label_tags.")) {
        return true;
      }

      let keys = path.split(".");
      let schema = get(fieldSchema({ space: State.SPACE.SAMPLE }));

      if (keys[0] === "frames" && !(keys[0] in schema)) {
        schema = get(fieldSchema({ space: State.SPACE.FRAME }));
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

    if (Object.keys(frames).length) {
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
  get:
    ({ path, space, ftype, embeddedDocType } = {}) =>
    ({ get }) => {
      if (path && space) {
        throw new Error("path and space provided");
      }

      const sampleLabels = Object.keys(
        get(fieldSchema({ space: State.SPACE.SAMPLE }))
      )
        .filter((l) => !l.startsWith("_"))
        .sort();
      const frameLabels = Object.keys(
        get(fieldSchema({ space: State.SPACE.FRAME }))
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
  get:
    (params = {}) =>
    ({ get }) => {
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

export const field = selectorFamily<Field | null, string>({
  key: "field",
  get:
    (path) =>
    ({ get }) => {
      let keys = path.split(".");
      if (keys[0] === "frames") {
        keys = keys.slice(1);

        let schema = get(fieldSchema({ space: State.SPACE.FRAME }));
        let field: Field = {
          name: "frames",
          ftype: LIST_FIELD,
          subfield: EMBEDDED_DOCUMENT_FIELD,
          embeddedDocType: "FRAMES",
          fields: schema,
          dbField: null,
        };
        for (const name of keys) {
          if (schema[name]) {
            field = schema[name];
            schema = field.fields;
          } else {
            return null;
          }
        }
        return field;
      }

      let field: Field = null;
      let schema = get(fieldSchema({ space: State.SPACE.SAMPLE }));
      for (const name of path.split(".")) {
        if (schema[name]) {
          field = schema[name];
          schema = field.fields;
        } else {
          return null;
        }
      }

      return field;
    },
});

export const labelFields = selectorFamily<string[], { space?: State.SPACE }>({
  key: "labelFields",
  get:
    (params) =>
    ({ get }) => {
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
  get:
    ({ expanded = true, ...params }) =>
    ({ get }) => {
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

const convertToLabelValue = (sampleId, path) => (raw) => {
  const labelId = raw._id;
  const field = path.split(".").shift();
  return { labelId, field, sampleId };
};

export const labelValues = selectorFamily<
  string[],
  { sample: Sample; expanded?: boolean }
>({
  key: "labelValues",
  get:
    ({ sample, expanded = true }) =>
    ({ get }) => {
      const paths = get(labelPaths({ expanded }));
      let results = [];

      for (const path of paths) {
        const convert = convertToLabelValue(sample._id, path);
        const value = _.get(sample, path, null);
        if (value !== null) {
          if (Array.isArray(value)) {
            results = [...results, ...value.map(convert)];
          } else {
            results.push(convert(value));
          }
        }
      }
      return results;
    },
});

export const expandPath = selectorFamily<string, string>({
  key: "expandPath",
  get:
    (path) =>
    ({ get }) => {
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
  get:
    (path) =>
    ({ get }) => {
      const labelField = get(field(path));

      const typePath = labelField.embeddedDocType.split(".");
      const type = typePath[typePath.length - 1];

      if (type in LABEL_LIST) {
        return `${path}.${LABEL_LIST[type]}`;
      }

      return path;
    },
});

export const _activeFields = atomFamily<string[], { modal: boolean }>({
  key: "_activeFields",
  default: null,
});

export const activeFields = selectorFamily<string[], { modal: boolean }>({
  key: "activeFields",
  get:
    ({ modal }) =>
    ({ get }) => {
      return filterPaths(
        get(_activeFields({ modal })) || get(labelFields({})),
        buildSchema(get(atoms.dataset))
      );
    },
  set:
    ({ modal }) =>
    ({ set }, value) => {
      set(_activeFields({ modal }), value);
    },
});

type ActiveFieldSelector = (params: {
  /**
   * Whether the field is in a modal or not
   */
  modal: boolean;
  /**
   * The path of the field
   * @example "frames.0.label"
   */
  path: string;
}) => RecoilState<boolean>;

/**
 * Get or set the active state of a field.
 */
export const activeField: ActiveFieldSelector = selectorFamily<
  boolean,
  { modal: boolean; path: string }
>({
  key: "activeField",
  get:
    ({ modal, path }) =>
    ({ get }) => {
      return get(activeFields({ modal })).includes(path);
    },

  set:
    ({ modal, path }) =>
    ({ get, set }, active) => {
      const fields = get(activeFields({ modal }));
      set(
        activeFields({ modal }),
        active ? [path, ...fields] : fields.filter((field) => field !== path)
      );
    },
});

export const activeLabelFields = selectorFamily<
  string[],
  { modal: boolean; space?: State.SPACE }
>({
  key: "activeLabelFields",
  get:
    ({ modal }) =>
    ({ get }) => {
      const active = new Set(get(activeFields({ modal })));
      return get(labelFields({})).filter((field) => active.has(field));
    },
});

export const activeLabelPaths = selectorFamily<
  string[],
  { modal: boolean; space?: State.SPACE }
>({
  key: "activeLabelPaths",
  get:
    ({ modal }) =>
    ({ get }) => {
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
  get:
    ({ path, ftype, embeddedDocType, acceptLists = true, under = false }) =>
    ({ get }) => {
      if (!under && path.startsWith("_")) {
        return false;
      }

      const fieldValue = get(field(path));

      if (!fieldValue) {
        return false;
      }

      return meetsFieldType(fieldValue, {
        ftype,
        embeddedDocType,
        acceptLists,
      });
    },
});

export const fieldType = selectorFamily<
  string,
  { path: string; useListSubfield?: boolean }
>({
  key: "fieldType",
  get:
    ({ path, useListSubfield = true }) =>
    ({ get }) => {
      const { ftype, subfield } = get(field(path));
      if (useListSubfield && ftype === LIST_FIELD) {
        return subfield;
      }

      return ftype;
    },
});

export const filterFields = selectorFamily<string[], string>({
  key: "filterFields",
  get:
    (path) =>
    ({ get }) => {
      const keys = path.split(".");
      const f = get(field(path));

      if (
        keys.length === 1 ||
        (f.ftype === LIST_FIELD && f.subfield === EMBEDDED_DOCUMENT_FIELD)
      ) {
        return [path];
      }

      const parentPath = keys.slice(0, -1).join(".");
      const parent = get(field(parentPath));
      let topParentPath = parentPath;
      if (parent.ftype === LIST_FIELD) {
        topParentPath = parentPath.split(".").slice(0, -1).join(".");
      }

      const topParent = get(field(topParentPath));

      const label = LABELS.includes(topParent?.embeddedDocType);
      const excluded = EXCLUDED[topParent?.embeddedDocType] || [];

      if (label && path.endsWith(".tags")) {
        return [[parentPath, "tags"].join(".")];
      }

      return Object.entries(parent.fields)
        .map(([name, data]) => ({ ...data, name }))
        .filter(({ name, ftype, subfield }) => {
          if (ftype === LIST_FIELD) {
            ftype = subfield;
          }

          if (name.startsWith("_")) {
            return false;
          }

          if (label && name === "tags") {
            return false;
          }

          return (
            !label ||
            (!excluded.includes(name) && VALID_PRIMITIVE_TYPES.includes(ftype))
          );
        })
        .map(({ name }) => [parentPath, name].join("."));
    },
});

const EXCLUDED = {
  [withPath(LABELS_PATH, DETECTION)]: ["bounding_box"],
  [withPath(LABELS_PATH, DETECTIONS)]: ["bounding_box"],
};
