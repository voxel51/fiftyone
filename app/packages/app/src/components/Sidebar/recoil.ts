import { atomFamily, DefaultValue, selector, selectorFamily } from "recoil";
import {
  DICT_FIELD,
  EMBEDDED_DOCUMENT_FIELD,
  LABELS_PATH,
  LABEL_DOC_TYPES,
  LIST_FIELD,
  Schema,
  StrictField,
  VALID_LABEL_TYPES,
  VALID_PRIMITIVE_TYPES,
  withPath,
} from "@fiftyone/utilities";

import * as aggregationAtoms from "../../recoil/aggregations";
import {
  buildSchema,
  fieldPaths,
  fields,
  filterPaths,
  pathIsShown,
} from "../../recoil/schema";
import { datasetName } from "../../recoil/selectors";
import { State } from "../../recoil/types";
import * as viewAtoms from "../../recoil/view";
import { http } from "../../shared/connection";

import {
  EmptyEntry,
  EntryKind,
  GroupEntry,
  PathEntry,
  SidebarEntry,
  InputEntry,
} from "./utils";

export const groupShown = atomFamily<boolean, { name: string; modal: boolean }>(
  {
    key: "sidebarGroupShown",
    default: true,
  }
);

const fieldsReducer = (ftypes: string[], docTypes: string[] = []) => (
  acc: string[],
  { ftype, subfield, embeddedDocType, name }: StrictField
): string[] => {
  if (name.startsWith("_")) {
    return acc;
  }

  if (ftype === LIST_FIELD) {
    ftype = subfield;
  }

  if (ftypes.includes(ftype)) {
    return [...acc, name];
  }

  if (ftype === EMBEDDED_DOCUMENT_FIELD) {
    if (docTypes.includes(embeddedDocType)) {
      return [...acc, name];
    }
  }

  return acc;
};

const LABELS = withPath(LABELS_PATH, VALID_LABEL_TYPES);

const DEFAULT_IMAGE_GROUPS = [
  { name: "tags", paths: [] },
  { name: "label tags", paths: [] },
  { name: "metadata", paths: [] },
  { name: "labels", paths: [] },
  { name: "primitives", paths: [] },
  { name: "other", paths: [] },
];

const DEFAULT_VIDEO_GROUPS = [
  { name: "tags", paths: [] },
  { name: "label tags", paths: [] },
  { name: "metadata", paths: [] },
  { name: "labels", paths: [] },
  { name: "frame labels", paths: [] },
  { name: "primitives", paths: [] },
  { name: "other", paths: [] },
];

export const resolveGroups = (dataset: State.Dataset): State.SidebarGroups => {
  let source = dataset.appSidebarGroups;

  if (!source) {
    source = dataset.frameFields.length
      ? DEFAULT_VIDEO_GROUPS
      : DEFAULT_IMAGE_GROUPS;
  }

  const groups = source.map(({ name, paths }) => [
    name,
    paths,
  ]) as State.SidebarGroups;
  const present = new Set(groups.map(([_, paths]) => paths).flat());

  const updater = groupUpdater(groups, buildSchema(dataset));

  const primitives = dataset.sampleFields
    .reduce(fieldsReducer(VALID_PRIMITIVE_TYPES), [])
    .filter((path) => path !== "tags" && !present.has(path));

  const labels = dataset.sampleFields
    .reduce(fieldsReducer([], LABELS), [])
    .filter((path) => !present.has(path));

  const frameLabels = dataset.frameFields
    .reduce(fieldsReducer([], LABELS), [])
    .map((path) => `frames.${path}`)
    .filter((path) => !present.has(path));

  updater("labels", labels);
  dataset.frameFields.length && updater("frame labels", frameLabels);
  updater("primitives", primitives);

  const fields = Object.fromEntries(
    dataset.sampleFields.map(({ name, ...rest }) => [name, rest])
  );

  let other = dataset.sampleFields.reduce(fieldsReducer([DICT_FIELD]), []);

  dataset.sampleFields
    .filter(({ embeddedDocType }) => !LABELS.includes(embeddedDocType))
    .reduce(fieldsReducer([EMBEDDED_DOCUMENT_FIELD]), [])
    .forEach((name) => {
      const fieldPaths = (fields[name].fields || [])
        .reduce(fieldsReducer(VALID_PRIMITIVE_TYPES), [])
        .map((subfield) => `${name}.${subfield}`)
        .filter((path) => !present.has(path));

      other = [
        ...other,
        ...(fields[name].fields || [])
          .reduce(fieldsReducer([DICT_FIELD]), [])
          .map((subfield) => `${name}.${subfield}`),
      ];

      updater(name, fieldPaths);
    });

  other = [
    ...other,
    ...dataset.frameFields
      .reduce(fieldsReducer([...VALID_PRIMITIVE_TYPES, DICT_FIELD]), [])
      .map((path) => `frames.${path}`),
  ];

  updater(
    "other",
    other.filter((path) => !present.has(path))
  );

  return groups;
};

const groupUpdater = (groups: State.SidebarGroups, schema: Schema) => {
  const groupNames = groups.map(([name]) => name);

  for (let i = 0; i < groups.length; i++) {
    groups[i][1] = filterPaths(groups[i][1], schema);
  }

  return (name: string, paths: string[]) => {
    if (paths.length === 0) return;

    const index = groupNames.indexOf(name);
    if (index < 0) {
      groups.push([name, paths]);
      return;
    }

    const group = groups[index][1];
    groups[index][1] = [...group, ...paths];
  };
};

export const sidebarGroupsDefinition = atomFamily<State.SidebarGroups, boolean>(
  {
    key: "sidebarGroupsDefinition",
    default: [],
  }
);

const visiblePaths = selector<Set<string>>({
  key: "visibalePaths",
  get: ({ get }) => {
    return new Set(
      get(sidebarGroups({ modal: false, loadingTags: true })).reduce(
        (paths, [_, groupPaths]) => {
          paths.push(...groupPaths);
          return paths;
        },
        []
      )
    );
  },
});

export const sidebarGroups = selectorFamily<
  State.SidebarGroups,
  { modal: boolean; loadingTags: boolean; filtered?: boolean }
>({
  key: "sidebarGroups",
  get: ({ modal, loadingTags, filtered = true }) => ({ get }) => {
    let groups = get(sidebarGroupsDefinition(modal))
      .map(([name, paths]) => [
        name,
        filtered ? paths.filter((path) => pathIsShown(path)) : paths,
      ])
      .filter(
        ([name, entries]) => entries.length || name !== "other"
      ) as State.SidebarGroups;

    if (!groups.length) return [];

    const groupNames = groups.map(([name]) => name);

    const tagsIndex = groupNames.indexOf("tags");
    const labelTagsIndex = groupNames.indexOf("label tags");

    if (!loadingTags) {
      groups[tagsIndex][1] = get(
        aggregationAtoms.values({ extended: false, modal, path: "tags" })
      ).map((tag) => `tags.${tag}`);
      groups[labelTagsIndex][1] = get(
        aggregationAtoms.cumulativeValues({
          extended: false,
          modal: false,
          path: "tags",
          ftype: EMBEDDED_DOCUMENT_FIELD,
          embeddedDocType: withPath(LABELS_PATH, LABEL_DOC_TYPES),
        })
      ).map((tag) => `_label_tags.${tag}`);
    }

    return groups;
  },
  set: ({ modal }) => ({ set, get }, groups) => {
    if (groups instanceof DefaultValue) return;

    const visible = get(visiblePaths);
    groups = groups.map(([name, paths]) => [
      name,
      ["tags", "label tags"].includes(name)
        ? []
        : [
            ...paths,
            ...get(
              sidebarGroup({ group: name, modal, loadingTags: true })
            ).filter((path) => !visible.has(path)),
          ],
    ]);

    set(sidebarGroupsDefinition(modal), groups);
    !modal &&
      fetch(`${http}/sidebar`, {
        method: "POST",
        cache: "no-cache",
        headers: {
          "Content-Type": "application/json",
        },
        mode: "cors",
        body: JSON.stringify({
          dataset: get(datasetName),
          groups: groups.map(([name, paths]) => ({ name, paths })),
          view: get(viewAtoms.view),
        }),
      }).catch((error) => {
        throw error;
      });
  },
});

export const sidebarEntries = selectorFamily<
  SidebarEntry[],
  { modal: boolean; loadingTags: boolean; filter: boolean }
>({
  key: "sidebarEntries",
  get: ({ filter = true, ...params }) => ({ get }) => {
    const f = get(textFilter(params.modal));
    const entries = [
      { type: "filter", kind: EntryKind.INPUT } as InputEntry,
      ...get(sidebarGroups(params))
        .map(([groupName, paths]) => {
          const group: GroupEntry = { name: groupName, kind: EntryKind.GROUP };
          const shown = get(
            groupShown({ name: groupName, modal: params.modal })
          );

          const filtered = filter
            ? paths.filter((path) => get(pathIsShown(path)) && path.includes(f))
            : paths;

          return [
            group,
            {
              kind: EntryKind.EMPTY,
              shown: filtered.length === 0 && shown,
              group: groupName,
            } as EmptyEntry,
            ...filtered.map<PathEntry>((path) => ({
              path,
              kind: EntryKind.PATH,
              shown,
            })),
          ];
        })
        .flat(),
    ];

    if (params.modal) {
      return entries;
    }

    return [...entries, { kind: EntryKind.INPUT, type: "add" } as InputEntry];
  },
  set: (params) => ({ set, get }, value) => {
    if (value instanceof DefaultValue) return;

    let current: string[];
    const has = new Set(
      value
        .filter((entry) => entry.kind === EntryKind.PATH)
        .map((entry) => (entry as PathEntry).path)
    );

    set(
      sidebarGroups(params),
      value.reduce((result, entry) => {
        if (entry.kind === EntryKind.GROUP) {
          current = [
            ...get(
              sidebarGroup({
                ...params,
                group: entry.name,
                filtered: true,
              })
            ),
          ];
          return [...result, [entry.name, []]];
        }

        if (entry.kind !== EntryKind.PATH) {
          return result;
        }

        if (
          entry.path.startsWith("tags.") ||
          entry.path.startsWith("_label_tags.")
        ) {
          return result;
        }

        if (current.length && current[0] === entry.path) {
          current.shift();
        } else {
          while (current.length && current[0] !== entry.path) {
            const next = current.shift();

            console.log(next, has);
            if (!has.has(next)) {
              result[result.length - 1][1].push(next);
            }
          }
        }

        result[result.length - 1][1].push(entry.path);
        return result;
      }, [])
    );
  },
});

export const disabledPaths = selector<Set<string>>({
  key: "disabledPaths",
  get: ({ get }) => {
    const paths = [...get(fieldPaths({ ftype: DICT_FIELD }))];

    get(
      fields({ ftype: EMBEDDED_DOCUMENT_FIELD, space: State.SPACE.SAMPLE })
    ).forEach(({ fields, name: prefix }) => {
      Object.values(fields)
        .filter(
          ({ ftype, subfield }) =>
            ftype === DICT_FIELD || subfield === DICT_FIELD
        )
        .forEach(({ name }) => paths.push(`${prefix}.${name}`));
    });

    get(fields({ space: State.SPACE.FRAME })).forEach(
      ({ name, embeddedDocType }) => {
        if (LABELS.includes(embeddedDocType)) {
          return;
        }

        paths.push(`frames.${name}`);
      }
    );

    return new Set(paths);
  },
});

export const sidebarGroup = selectorFamily<
  string[],
  { modal: boolean; group: string; loadingTags: boolean; filtered?: boolean }
>({
  key: "sidebarGroup",
  get: ({ group, ...params }) => ({ get }) => {
    return get(sidebarGroups(params)).filter(([name]) => name === group)[0][1];
  },
});

export const sidebarGroupNames = selectorFamily<string[], boolean>({
  key: "sidebarGroupNames",
  get: (modal) => ({ get }) => {
    return get(sidebarGroups({ modal, loadingTags: true })).map(
      ([name]) => name
    );
  },
});

export const groupIsEmpty = selectorFamily<
  boolean,
  { modal: boolean; group: string }
>({
  key: "groupIsEmpty",
  get: (params) => ({ get }) => {
    return Boolean(
      get(sidebarGroup({ ...params, loadingTags: true, filtered: false }))
        .length
    );
  },
});

export const textFilter = atomFamily<string, boolean>({
  key: "textFilter",
  default: "",
});
