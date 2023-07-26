import { LabelData } from "@fiftyone/looker";
import {
  DETECTION,
  DETECTIONS,
  EMBEDDED_DOCUMENT_FIELD,
  Field,
  LABEL_LIST,
  LABEL_LISTS,
  LABEL_LISTS_MAP,
  LABELS,
  LABELS_MAP,
  LABELS_PATH,
  LIST_FIELD,
  meetsFieldType,
  Schema,
  StrictField,
  VALID_PRIMITIVE_TYPES,
  withPath,
} from "@fiftyone/utilities";
import { atomFamily, RecoilState, selector, selectorFamily } from "recoil";
import * as atoms from "./atoms";
import { activeModalSample } from "./groups";
import { State } from "./types";
import { getLabelFields } from "./utils";

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

export const buildFlatExtendedSchema = (schema: Schema): Schema => {
  const flatSchema = {} as Schema;
  const fieldsQueue = [];
  for (const fieldName in schema) {
    const field = schema[fieldName];
    fieldsQueue.push(field);
  }
  while (fieldsQueue?.length) {
    const ff = fieldsQueue.shift();
    const ffNest = ff?.fields;
    const fieldPath = ff?.path;

    if (ffNest) {
      for (const fNested in ffNest) {
        fieldsQueue.push(ffNest[fNested]);
      }
    }

    flatSchema[fieldPath] = {
      ...ff,
      visible: false,
    };
  }

  return flatSchema;
};

export const buildSchema = (
  sampleFields: StrictField[],
  frameFields: StrictField[],
  flat = false
): Schema => {
  const schema = sampleFields.reduce(schemaReduce, {});

  // TODO: mixed datasets - test video
  if (frameFields && frameFields.length) {
    schema.frames = {
      ftype: LIST_FIELD,
      name: "frames",
      fields: flat
        ? buildFlatExtendedSchema(frameFields.reduce(schemaReduce, {}))
        : frameFields.reduce(schemaReduce, {}),
      dbField: null,
      description: null,
      info: null,
      embeddedDocType: null,
      subfield: "Frame",
    };
  }

  if (flat) {
    return buildFlatExtendedSchema(sampleFields.reduce(schemaReduce, {}));
  }

  return schema;
};

export const fieldSchema = selectorFamily<
  Schema,
  { space: State.SPACE; flat?: boolean }
>({
  key: "fieldSchema",
  get:
    ({ space, flat = false }) =>
    ({ get }) => {
      const dataset = get(atoms.dataset);

      if (!dataset) {
        return {};
      }

      if (flat) {
        return buildFlatExtendedSchema(
          (space === State.SPACE.FRAME
            ? dataset.frameFields
            : dataset.sampleFields
          ).reduce(schemaReduce, {})
        );
      }

      return (
        space === State.SPACE.FRAME ? dataset.frameFields : dataset.sampleFields
      ).reduce(schemaReduce, {});
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
          description: null,
          info: null,
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

      // use { flat: true } to get schema's dynamic fields included
      const sampleFields = get(
        fieldSchema({ space: State.SPACE.SAMPLE, flat: true })
      );
      const frameFields = get(
        fieldSchema({ space: State.SPACE.FRAME, flat: true })
      );

      const sampleLabels = Object.keys(sampleFields)
        .filter((l) => !l.startsWith("_"))
        .sort();
      const frameLabels = Object.keys(frameFields)
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
          description: null,
          info: null,
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
    ({ space }) =>
    ({ get }) => {
      const dataset = get(atoms.dataset);

      if (space) {
        return space === State.SPACE.FRAME
          ? getLabelFields(dataset.frameFields, "frames.")
          : getLabelFields(dataset.sampleFields);
      }

      return [
        ...getLabelFields(dataset.sampleFields),
        ...getLabelFields(dataset.frameFields, "frames."),
      ];
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

export const activeLabels = selectorFamily<LabelData[], { expanded?: boolean }>(
  {
    key: "activeLabels",
    get:
      ({ expanded = true }) =>
      ({ get }) => {
        const sample = get(activeModalSample);
        const paths = get(labelPaths({ expanded }));
        const pathsSet = new Set(paths);

        const results = [];

        const add = (label, path) => {
          if (!(label._cls in LABELS_MAP) || label._cls in LABEL_LISTS_MAP)
            return;

          results.push({
            labelId: label._id,
            sampleId: sample._id,
            field: path,
          });
        };

        const accumulate = (data: object, prefix = "") => {
          for (const field in data) {
            const label = data[field];
            if (!label) continue;
            const currentPath = `${prefix}${field}`;
            if (paths.every((p) => !p.startsWith(currentPath))) continue;

            const processed = Array.isArray(label) ? label : [label];
            processed.forEach((label) => {
              if (label._cls) {
                accumulate(label, `${currentPath}.`);
              }
            });

            if (!pathsSet.has(currentPath)) continue;

            if (Array.isArray(label)) {
              label.forEach((l) => add(l, currentPath));
            } else add(label, currentPath);
          }
        };

        accumulate(sample);
        return results;
      },
  }
);

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
      const dataset = get(atoms.dataset);
      return filterPaths(
        get(_activeFields({ modal })) || get(labelFields({})),
        buildSchema(dataset.sampleFields, dataset.frameFields)
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
