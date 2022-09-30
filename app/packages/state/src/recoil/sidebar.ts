import {
  atomFamily,
  DefaultValue,
  selector,
  selectorFamily,
  useRecoilStateLoadable,
  useRecoilValue,
  useRecoilValueLoadable,
} from "recoil";
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

import * as aggregationAtoms from "./aggregations";
import {
  buildSchema,
  fieldPaths,
  fields,
  filterPaths,
  pathIsShown,
} from "./schema";

import { State } from "./types";
import * as viewAtoms from "./view";
import { commitMutation, VariablesOf } from "react-relay";
import { getCurrentEnvironment } from "../hooks/useRouter";
import { setSidebarGroups, setSidebarGroupsMutation } from "@fiftyone/relay";
import { datasetName } from "./selectors";

export enum EntryKind {
  EMPTY = "EMPTY",
  GROUP = "GROUP",
  PATH = "PATH",
  INPUT = "INPUT",
}

export interface EmptyEntry {
  kind: EntryKind.EMPTY;
  shown: boolean;
  group: string;
}

export interface InputEntry {
  kind: EntryKind.INPUT;
  type: "add" | "filter";
}

export interface GroupEntry {
  kind: EntryKind.GROUP;
  name: string;
}

export interface PathEntry {
  kind: EntryKind.PATH;
  path: string;
  shown: boolean;
}

export type SidebarEntry = EmptyEntry | GroupEntry | PathEntry | InputEntry;

export const readableTags = selectorFamily<
  string[],
  { group: "tags" | "label tags"; modal: boolean }
>({
  key: "readableTags",
  get:
    ({ modal, group }) =>
    ({ get }) => {
      if (!modal && !get(groupShown({ group, modal }))) {
        return [];
      }

      return get(
        group === "label tags"
          ? aggregationAtoms.cumulativeValues({
              extended: false,
              modal,
              ...MATCH_LABEL_TAGS,
            })
          : aggregationAtoms.values({ extended: false, modal, path: "tags" })
      );
    },
});

export const useLabelTagText = (modal: boolean) => {
  const loadingLabelTags =
    useRecoilValueLoadable(readableTags({ modal, group: "label tags" }))
      .state === "loading";

  return loadingLabelTags ? "Loading label tags..." : "No label tags";
};

export const useTagText = (modal: boolean) => {
  const { singular } = useRecoilValue(viewAtoms.elementNames);
  const loadingTags =
    useRecoilValueLoadable(readableTags({ modal, group: "tags" })).state ===
    "loading";

  return loadingTags ? `Loading ${singular} tags...` : `No ${singular} tags`;
};

export const useEntries = (
  modal: boolean
): [SidebarEntry[], (entries: SidebarEntry[]) => void] => {
  const [entries, setEntries] = useRecoilStateLoadable(
    sidebarEntries({ modal, loadingTags: false, filtered: true })
  );
  const loadingEntries = useRecoilValue(
    sidebarEntries({ modal, loadingTags: true, filtered: true })
  );

  return [
    entries.state === "loading" ? loadingEntries : entries.contents,
    setEntries,
  ];
};

export const MATCH_LABEL_TAGS = {
  path: "tags",
  ftype: EMBEDDED_DOCUMENT_FIELD,
  embeddedDocType: withPath(LABELS_PATH, LABEL_DOC_TYPES),
};

export const validateGroupName = (current: string[], name: string): boolean => {
  if (!name.length) {
    alert("group name cannot be empty");
    return false;
  }

  if (RESERVED_GROUPS.has(name)) {
    alert(`${name.toUpperCase()} is a reserved group`);
    return false;
  }

  if (current.filter((cur) => name === cur).length >= 1) {
    alert(`Group ${name.toUpperCase()} already exists`);

    return false;
  }
  return true;
};

export const RESERVED_GROUPS = new Set([
  "frame tags",
  "label tags",
  "other",
  "patch tags",
  "sample tags",
  "clips tags",
  "tags",
]);

const fieldsReducer =
  (ftypes: string[], docTypes: string[] = []) =>
  (
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

export const resolveGroups = (dataset: State.Dataset): State.SidebarGroup[] => {
  let groups = dataset?.appConfig?.sidebarGroups;

  if (!groups) {
    groups = dataset.frameFields.length
      ? DEFAULT_VIDEO_GROUPS
      : DEFAULT_IMAGE_GROUPS;

    groups = groups.map((params) => ({ expanded: true, ...params }));
  }

  const present = new Set(groups.map(({ paths }) => paths).flat());

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

const groupUpdater = (groups: State.SidebarGroup[], schema: Schema) => {
  const groupNames = groups.map(({ name }) => name);

  for (let i = 0; i < groups.length; i++) {
    groups[i].paths = filterPaths(groups[i].paths, schema);
  }

  return (name: string, paths: string[]) => {
    if (paths.length === 0) return;

    const index = groupNames.indexOf(name);
    if (index < 0) {
      groups.push({ name, paths, expanded: true });
      return;
    }

    const group = groups[index].paths;
    groups[index].paths = [...group, ...paths];
  };
};

export const sidebarGroupsDefinition = atomFamily<
  State.SidebarGroup[],
  boolean
>({
  key: "sidebarGroupsDefinition",
  default: [],
});

export const sidebarGroups = selectorFamily<
  State.SidebarGroup[],
  { modal: boolean; loadingTags: boolean; filtered?: boolean }
>({
  key: "sidebarGroups",
  get:
    ({ modal, loadingTags, filtered = true }) =>
    ({ get }) => {
      const f = get(textFilter(modal));

      let groups = get(sidebarGroupsDefinition(modal))
        .map(({ paths, ...rest }) => ({
          ...rest,

          paths: filtered
            ? paths.filter((path) => get(pathIsShown(path)) && path.includes(f))
            : paths,
        }))
        .filter(
          ({ name, paths }) => paths.length || name !== "other"
        ) as State.SidebarGroup[];

      if (!groups.length) return [];

      const groupNames = groups.map(({ name }) => name);

      const tagsIndex = groupNames.indexOf("tags");
      const labelTagsIndex = groupNames.indexOf("label tags");

      if (!loadingTags) {
        groups[tagsIndex].expanded &&
          (groups[tagsIndex].paths = get(
            aggregationAtoms.values({ extended: false, modal, path: "tags" })
          )
            .filter((tag) => !filtered || tag.includes(f))
            .map((tag) => `tags.${tag}`));
        groups[labelTagsIndex].expanded &&
          (groups[labelTagsIndex].paths = get(
            aggregationAtoms.cumulativeValues({
              extended: false,
              modal: false,
              path: "tags",
              ftype: EMBEDDED_DOCUMENT_FIELD,
              embeddedDocType: withPath(LABELS_PATH, LABEL_DOC_TYPES),
            })
          )
            .filter((tag) => !filtered || tag.includes(f))
            .map((tag) => `_label_tags.${tag}`));
      }

      return groups;
    },
  set:
    ({ modal }) =>
    ({ set, get }, groups) => {
      if (groups instanceof DefaultValue) return;

      const allPaths = new Set(groups.map(({ paths }) => paths).flat());

      groups = groups.map(({ name, paths, expanded }) => {
        if (["tags", "label tags"].includes(name)) {
          return { name, paths: [], expanded };
        }

        const result = [];
        const current = [
          ...get(
            sidebarGroup({
              modal,
              group: name,
              loadingTags: false,
              filtered: false,
            })
          ),
        ];

        const fill = (path?: string) => {
          while (current.length && current[0] !== path) {
            const next = current.shift();

            if (!allPaths.has(next)) {
              result.push(next);
            }
          }

          if (current.length && current[0] === path) {
            current.shift();
          }
        };

        paths.forEach((path) => {
          result.push(path);
          if (!current.includes(path)) {
            return;
          }

          fill(path);
        });

        fill();

        return { name, paths: result, expanded };
      });

      set(sidebarGroupsDefinition(modal), groups);

      if (groups instanceof DefaultValue) {
        return;
      }

      !modal &&
        persistSidebarGroups({
          dataset: get(datasetName),
          stages: get(viewAtoms.view),
          sidebarGroups: groups,
        });
    },
  cachePolicy_UNSTABLE: {
    eviction: "most-recent",
  },
});

export const persistSidebarGroups = (
  variables: VariablesOf<setSidebarGroupsMutation>
) => {
  commitMutation<setSidebarGroupsMutation>(getCurrentEnvironment(), {
    mutation: setSidebarGroups,
    variables,
  });
};

export const sidebarEntries = selectorFamily<
  SidebarEntry[],
  { modal: boolean; loadingTags: boolean; filtered?: boolean }
>({
  key: "sidebarEntries",
  get:
    (params) =>
    ({ get }) => {
      const entries = [
        { type: "filter", kind: EntryKind.INPUT } as InputEntry,
        ...get(sidebarGroups(params))
          .map(({ name, paths }) => {
            const group: GroupEntry = {
              name: name,
              kind: EntryKind.GROUP,
            };
            const shown = get(groupShown({ group: name, modal: params.modal }));

            return [
              group,
              {
                kind: EntryKind.EMPTY,
                shown: paths.length === 0 && shown,
                group: name,
              } as EmptyEntry,
              ...paths.map<PathEntry>((path) => ({
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
  set:
    (params) =>
    ({ set, get }, value) => {
      if (value instanceof DefaultValue) return;

      set(
        sidebarGroups(params),
        value.reduce((result, entry) => {
          if (entry.kind === EntryKind.GROUP) {
            return [
              ...result,
              {
                name: entry.name,
                expanded: get(
                  groupShown({ modal: params.modal, group: entry.name })
                ),
                paths: [],
              },
            ];
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

          result[result.length - 1].paths.push(entry.path);
          return result;
        }, [] as State.SidebarGroup[])
      );
    },
  cachePolicy_UNSTABLE: {
    eviction: "most-recent",
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
  cachePolicy_UNSTABLE: {
    eviction: "most-recent",
  },
});

export const sidebarGroupMapping = selectorFamily<
  { [name: string]: Omit<State.SidebarGroup, "name"> },
  { modal: boolean; loadingTags: boolean; filtered?: boolean }
>({
  key: "sidebarGroupMapping",
  get:
    (params) =>
    ({ get }) => {
      const groups = get(sidebarGroups(params));
      return Object.fromEntries(
        groups.map(({ name, ...rest }) => [name, rest])
      );
    },
});

export const sidebarGroup = selectorFamily<
  string[],
  { modal: boolean; group: string; loadingTags: boolean; filtered?: boolean }
>({
  key: "sidebarGroup",
  get:
    ({ group, ...params }) =>
    ({ get }) => {
      const match = get(sidebarGroups(params)).filter(
        ({ name }) => name === group
      );

      return match.length ? match[0].paths : [];
    },
  cachePolicy_UNSTABLE: {
    eviction: "most-recent",
  },
});

export const sidebarGroupNames = selectorFamily<string[], boolean>({
  key: "sidebarGroupNames",
  get:
    (modal) =>
    ({ get }) => {
      return get(sidebarGroups({ modal, loadingTags: true })).map(
        ({ name }) => name
      );
    },
  cachePolicy_UNSTABLE: {
    eviction: "most-recent",
  },
});

export const groupIsEmpty = selectorFamily<
  boolean,
  { modal: boolean; group: string }
>({
  key: "groupIsEmpty",
  get:
    (params) =>
    ({ get }) => {
      return Boolean(
        get(sidebarGroup({ ...params, loadingTags: true, filtered: false }))
          .length == 0
      );
    },
  cachePolicy_UNSTABLE: {
    eviction: "most-recent",
  },
});

export const groupShown = selectorFamily<
  boolean,
  { modal: boolean; group: string }
>({
  key: "groupShown",
  get:
    ({ group, modal }) =>
    ({ get }) => {
      return get(sidebarGroupMapping({ modal, loadingTags: true }))[group]
        .expanded;
    },
  set:
    ({ modal, group }) =>
    ({ get, set }, expanded) => {
      const current = get(sidebarGroups({ modal, loadingTags: true }));
      set(
        sidebarGroups({ modal, loadingTags: true }),
        current.map(({ name, ...data }) =>
          name === group
            ? { name, ...data, expanded: Boolean(expanded) }
            : { name, ...data }
        )
      );
    },
});

export const textFilter = atomFamily<string, boolean>({
  key: "textFilter",
  default: "",
});

export const sidebarVisible = atomFamily<boolean, boolean>({
  key: "sidebarVisible",
  default: true,
});

export const sidebarWidth = atomFamily<number, boolean>({
  key: "sidebarWidth",
  default: 300,
});
