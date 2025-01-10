import { LabelData } from "@fiftyone/looker";
import {
  datasetFragment,
  datasetFragment$key,
  graphQLSyncFragmentAtomFamily,
} from "@fiftyone/relay";
import {
  DETECTION,
  DETECTIONS,
  DYNAMIC_EMBEDDED_DOCUMENT_FIELD,
  EMBEDDED_DOCUMENT_FIELD,
  Field,
  LABELS,
  LABELS_MAP,
  LABELS_PATH,
  LABEL_LIST,
  LABEL_LISTS,
  LABEL_LISTS_MAP,
  LIST_FIELD,
  OBJECT_ID_FIELD,
  STRING_FIELD,
  Schema,
  StrictField,
  VALID_NUMERIC_TYPES,
  VALID_PRIMITIVE_TYPES,
  getDenseLabelNames,
  meetsFieldType,
  withPath,
} from "@fiftyone/utilities";
import { RecoilState, selector, selectorFamily } from "recoil";
import * as atoms from "./atoms";
import { dataset as datasetAtom } from "./dataset";
import { activeModalSample } from "./groups";
import { labelPathsSetExpanded } from "./labels";
import { defaultVisibilityLabels } from "./selectors";
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

export const buildSchema = (
  sampleFields: StrictField[],
  frameFields: StrictField[]
): Schema => {
  const schema = sampleFields.reduce(schemaReduce, {});

  if (frameFields && frameFields.length) {
    schema.frames = {
      path: "frames",
      ftype: LIST_FIELD,
      name: "frames",
      fields: frameFields.reduce(schemaReduce, {}),
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
      const dataset = get(datasetAtom);

      if (!dataset) {
        return {};
      }

      return (
        space === State.SPACE.FRAME
          ? get(atoms.frameFields)
          : get(atoms.sampleFields)
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
          info: null,
          path: "frames",
          description: null,
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

      const sampleFields = get(atoms.flatSampleFields);
      const frameFields = get(atoms.flatFrameFields);

      const sample = sampleFields
        .map(({ path }) => path)
        .filter((l) => !l.startsWith("_"))
        .sort();
      const frame = frameFields
        .map(({ path }) => path)
        .filter((l) => !l.startsWith("_"))
        .map((l) => "frames." + l)
        .sort();

      const f = (paths) =>
        paths.filter(
          (p) => !ftype || get(meetsType({ path: p, ftype, embeddedDocType }))
        );

      if (space === State.SPACE.SAMPLE) {
        return f(sample);
      }

      if (space === State.SPACE.FRAME) {
        return f(frame);
      }

      if (!space && !path) {
        return f(sample.concat(frame).sort());
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
      if (
        keys[0] === "frames" &&
        Object.keys(get(fieldSchema({ space: State.SPACE.FRAME }))).length
      ) {
        keys = keys.slice(1);

        let schema = get(fieldSchema({ space: State.SPACE.FRAME }));
        let field: Field = {
          path: "frames",
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

export const dbPath = selectorFamily({
  key: "dbPath",
  get:
    (path: string) =>
    ({ get }) => {
      const fieldData = get(field(path));
      if (!fieldData?.dbField) {
        return path;
      }

      const keys = path.split(".");
      keys[keys.length - 1] = fieldData.dbField;
      return keys.join(".");
    },
});

export const defaultVisibleLabels = selector({
  key: "defaultVisibleLabels",
  get: ({ get }) => {
    const sampleSchema = get(fieldSchema({ space: State.SPACE.SAMPLE }));
    const frameSchema = get(fieldSchema({ space: State.SPACE.FRAME }));

    const denseLabelsSamples = getDenseLabelNames(sampleSchema);
    const denseLabelsFrames = getDenseLabelNames(frameSchema).map(
      (l) => `frames.${l}`
    );

    const denseLabels = [...denseLabelsSamples, ...denseLabelsFrames];

    const allSampleLabels = get(labelFields({ space: State.SPACE.SAMPLE }));
    const allFrameLabels = get(labelFields({ space: State.SPACE.FRAME }));
    const allLabels = [...allSampleLabels, ...allFrameLabels];

    const defaultVisibleLabelsConfig = get(defaultVisibilityLabels);

    if (
      !defaultVisibleLabelsConfig?.include &&
      !defaultVisibleLabelsConfig?.exclude
    ) {
      return allLabels.filter((label) => !denseLabels.includes(label));
    }

    if (
      defaultVisibleLabelsConfig.include &&
      !defaultVisibleLabelsConfig.exclude
    ) {
      return allLabels.filter((label) =>
        defaultVisibleLabelsConfig.include.includes(label)
      );
    }

    if (
      !defaultVisibleLabelsConfig.include &&
      defaultVisibleLabelsConfig.exclude
    ) {
      return allLabels.filter(
        (label) => !defaultVisibleLabelsConfig.exclude.includes(label)
      );
    }

    // is in both include and exclude
    const includeList = new Set(defaultVisibleLabelsConfig.include);
    const excludeList = new Set(defaultVisibleLabelsConfig.exclude);
    // resolved = set(include) - set(exclude)
    const resolved = new Set(
      [...includeList].filter((x) => !excludeList.has(x))
    );
    return allLabels.filter((label) => resolved.has(label));
  },
});

export const labelFields = selectorFamily<string[], { space?: State.SPACE }>({
  key: "labelFields",
  get:
    ({ space }) =>
    ({ get }) => {
      if (space) {
        return space === State.SPACE.FRAME
          ? getLabelFields(get(atoms.frameFields), "frames.")
          : getLabelFields(get(atoms.sampleFields));
      }

      return [
        ...getLabelFields(get(atoms.sampleFields)),
        ...getLabelFields(get(atoms.frameFields), "frames."),
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

export const _activeFields = (() => {
  let data: { activeFields: string[]; datasetId: string };
  try {
    data = JSON.parse(sessionStorage.getItem("activeFields"));
  } catch {}

  let { activeFields: current, datasetId } = data || {};
  let modalCurrent: string[] = null;

  return graphQLSyncFragmentAtomFamily<
    datasetFragment$key,
    null | string[],
    { modal: boolean }
  >(
    {
      fragments: [datasetFragment],
      keys: ["dataset"],
      default: null,
      read: (dataset, _, { modal }) => {
        if (
          dataset?.datasetId === undefined ||
          dataset?.datasetId !== datasetId
        ) {
          datasetId = dataset?.datasetId;
          sessionStorage.removeItem("activeFields");
          modalCurrent = null;
          current = null;
        }

        return modal ? modalCurrent : current;
      },
    },
    {
      key: "_activeFields",
      effects: ({ modal }) => [
        ({ onSet }) => {
          onSet((newValue) => {
            if (modal) {
              modalCurrent = newValue;
            } else {
              current = newValue;
              sessionStorage.setItem(
                "activeFields",
                JSON.stringify({ datasetId, activeFields: current })
              );
            }
          });
        },
      ],
    }
  );
})();

export const activeFields = selectorFamily<string[], { modal: boolean }>({
  key: "activeFields",
  get:
    ({ modal }) =>
    ({ get }) => {
      return filterPaths(
        get(_activeFields({ modal })) || get(defaultVisibleLabels),
        buildSchema(get(atoms.sampleFields), get(atoms.frameFields))
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

const filterFieldsCommon = selectorFamily<string[], string>({
  key: "filterFieldsCommon",
  get:
    (path) =>
    ({ get }) => {
      const parent = get(field(path));

      const label = LABELS.includes(parent?.embeddedDocType);
      const excluded = EXCLUDED[parent?.embeddedDocType] || [];

      return get(fields({ path }))
        .filter(({ name, ftype, subfield }) => {
          if (ftype === LIST_FIELD) {
            ftype = subfield;
          }

          if (name.startsWith("_")) {
            return false;
          }

          return (
            !label ||
            (!excluded.includes(name) && VALID_PRIMITIVE_TYPES.includes(ftype))
          );
        })
        .map(({ name }) => [path, name].join("."));
    },
});

export const modalFilterFields = selectorFamily({
  key: "modalFilterFields",
  get:
    (path: string) =>
    ({ get }) => {
      const labelPaths = get(labelPathsSetExpanded);

      if (!labelPaths.has(path)) {
        path = path.split(".").slice(0, -1).join(".");
        if (labelPaths.has(path)) {
          throw new Error(`unexpected modalFilterField path '${path}'`);
        }
      }

      return [path, ...get(filterFieldsCommon(path)).flat()].sort();
    },
});

export const filterFields = selectorFamily({
  key: "filterFields",
  get:
    (path: string) =>
    ({ get }) => {
      const f = get(field(path));

      if (
        !f ||
        f?.ftype === EMBEDDED_DOCUMENT_FIELD ||
        (f?.ftype === LIST_FIELD && f.subfield === EMBEDDED_DOCUMENT_FIELD)
      ) {
        return [path];
      }

      const keys = path.split(".");

      if (keys.length > 1) {
        const parent = keys.slice(0, -1).join(".");
        return get(filterFieldsCommon(parent));
      }

      return [keys[0]];
    },
});

const EXCLUDED = {
  [withPath(LABELS_PATH, DETECTION)]: ["bounding_box"],
  [withPath(LABELS_PATH, DETECTIONS)]: ["bounding_box"],
};

export const isInListField = selectorFamily({
  key: "isInListField",
  get:
    (path: string) =>
    ({ get }) => {
      const parent = get(parentField(path));

      return (
        parent?.ftype === LIST_FIELD &&
        [EMBEDDED_DOCUMENT_FIELD, DYNAMIC_EMBEDDED_DOCUMENT_FIELD].includes(
          parent.subfield
        )
      );
    },
});

export const isListField = selectorFamily({
  key: "isListField",
  get:
    (path: string) =>
    ({ get }) => {
      return get(field(path))?.ftype === LIST_FIELD;
    },
});

export const isStringField = selectorFamily({
  key: "isStringField",
  get:
    (path: string) =>
    ({ get }) => {
      const f = get(field(path));
      return f?.ftype === STRING_FIELD || f?.subfield === STRING_FIELD;
    },
});

export const isNumericField = selectorFamily({
  key: "isNumericField",
  get:
    (path: string) =>
    ({ get }) => {
      const f = get(field(path));
      return (
        VALID_NUMERIC_TYPES.includes(f?.ftype) ||
        VALID_NUMERIC_TYPES.includes(f?.subfield)
      );
    },
});

export const isObjectIdField = selectorFamily({
  key: "isObjectIdField",
  get:
    (path: string) =>
    ({ get }) => {
      const f = get(field(path));
      return f?.ftype === OBJECT_ID_FIELD || f?.subfield === OBJECT_ID_FIELD;
    },
});

export const parentField = selectorFamily({
  key: "parentField",
  get:
    (path: string) =>
    ({ get }) => {
      const parent = path.split(".").slice(0, -1).join(".");
      return get(field(parent));
    },
});

export const isOfDocumentFieldList = selectorFamily({
  key: "isOfDocumentFieldList",
  get:
    (path: string) =>
    ({ get }) => {
      const parent = path.split(".").slice(0, -1).join(".");
      if (!parent) {
        return false;
      }
      const f = get(field(parent));

      return [
        DYNAMIC_EMBEDDED_DOCUMENT_FIELD,
        EMBEDDED_DOCUMENT_FIELD,
      ].includes(f.subfield || "");
    },
});
