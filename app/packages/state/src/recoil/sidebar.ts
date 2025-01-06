import type {
  frameFieldsFragment$key,
  sampleFieldsFragment$key,
  setSidebarGroupsMutation,
  sidebarGroupsFragment$key,
} from "@fiftyone/relay";
import {
  datasetFragment,
  frameFieldsFragment,
  graphQLSyncFragmentAtomFamily,
  readFragment,
  sampleFieldsFragment,
  setSidebarGroups,
  sidebarGroupsFragment,
} from "@fiftyone/relay";
import type { Field, Schema, StrictField } from "@fiftyone/utilities";
import {
  DICT_FIELD,
  EMBEDDED_DOCUMENT_FIELD,
  LABELS_PATH,
  LABEL_DOC_TYPES,
  LIST_FIELD,
  UNSUPPORTED_FILTER_TYPES,
  VALID_LABEL_TYPES,
  VALID_PRIMITIVE_TYPES,
  withPath,
} from "@fiftyone/utilities";
import type { VariablesOf } from "react-relay";
import { commitMutation } from "react-relay";
import {
  DefaultValue,
  atom,
  atomFamily,
  selector,
  selectorFamily,
  useRecoilStateLoadable,
  useRecoilValueLoadable,
} from "recoil";
import { collapseFields, getCurrentEnvironment } from "../utils";
import * as atoms from "./atoms";
import { getBrowserStorageEffectForKey } from "./customEffects";
import {
  active3dSlices,
  active3dSlicesToSampleMap,
  activeModalSidebarSample,
  pinned3DSampleSlice,
} from "./groups";
import { isLargeVideo } from "./options";
import { cumulativeValues, values } from "./pathData";
import {
  buildSchema,
  field,
  fieldPaths,
  fields,
  filterPaths,
  isOfDocumentFieldList,
  pathIsShown,
} from "./schema";
import { isFieldVisibilityActive } from "./schemaSettings.atoms";
import {
  datasetName,
  disableFrameFiltering,
  isVideoDataset,
  stateSubscription,
} from "./selectors";
import { State } from "./types";
import {
  fieldsMatcher,
  groupFilter,
  labelsMatcher,
  primitivesMatcher,
  unsupportedMatcher,
} from "./utils";
import * as viewAtoms from "./view";

type GridPageNumber = number;
type SidebarEntriesSet = Set<string>;

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
      if (!modal && !get(groupShown({ group, modal, loading: false }))) {
        return [];
      }

      return get(
        group === "label tags"
          ? cumulativeValues({
              extended: false,
              modal,
              ...MATCH_LABEL_TAGS,
            })
          : values({ extended: false, modal, path: "tags" })
      );
    },
});

export const useEntries = (
  modal: boolean
): [SidebarEntry[], (entries: SidebarEntry[]) => void] => {
  const [entries, setEntries] = useRecoilStateLoadable(
    sidebarEntries({ modal, loading: false, filtered: true })
  );
  const loadingEntries = useRecoilValueLoadable(
    sidebarEntries({ modal, loading: true, filtered: true })
  );

  return [
    entries.state === "loading" ? loadingEntries.contents : entries.contents,
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

const LABELS = withPath(LABELS_PATH, VALID_LABEL_TYPES);

const DEFAULT_IMAGE_GROUPS: State.SidebarGroup[] = [
  { name: "tags", paths: [] },
  { name: "metadata", paths: [] },
  { name: "labels", paths: [] },
  { name: "primitives", paths: [] },
];

const DEFAULT_VIDEO_GROUPS: State.SidebarGroup[] = [
  { name: "tags", paths: [] },
  { name: "metadata", paths: [] },
  { name: "labels", paths: [] },
  { name: "frame labels", paths: [] },
  { name: "primitives", paths: [] },
];

const NONE = [null, undefined];

export const resolveGroups = (
  sampleFields: StrictField[],
  frameFields: StrictField[],
  currentGroups: State.SidebarGroup[],
  configGroups: State.SidebarGroup[]
): State.SidebarGroup[] => {
  let groups = currentGroups.length
    ? currentGroups
    : configGroups.length
    ? configGroups
    : frameFields.length
    ? DEFAULT_VIDEO_GROUPS
    : DEFAULT_IMAGE_GROUPS;

  const expanded = configGroups.reduce((map, { name, expanded }) => {
    map[name] = expanded;
    return map;
  }, {});

  groups = groups.map((group) => {
    return typeof expanded[group.name] === "boolean"
      ? { ...group, expanded: expanded[group.name] }
      : { ...group };
  });

  const metadata = groups.find(({ name }) => name === "metadata");
  if (!metadata) {
    groups.unshift({
      name: "metadata",
      expanded: true,
      paths: [],
    });
  }

  const tags = groups.find(({ name }) => name === "tags");
  groups = groups.filter(({ name }) => name !== "tags");
  groups.unshift({
    name: "tags",
    expanded: tags?.expanded,
    paths: [],
  });

  const present = new Set<string>(groups.flatMap(({ paths }) => paths));
  const updater = groupUpdater(
    groups,
    buildSchema(sampleFields, frameFields),
    present
  );

  updater(
    "labels",
    fieldsMatcher(sampleFields, labelsMatcher(), present),
    true
  );

  frameFields.length &&
    updater(
      "frame labels",
      fieldsMatcher(frameFields, labelsMatcher(), present, "frames."),
      true
    );

  updater(
    "primitives",
    fieldsMatcher(sampleFields, primitivesMatcher, present),
    true
  );

  for (const { fields, name } of sampleFields
    .filter(groupFilter)
    .filter(({ name }) => !present.has(name))) {
    updater(
      name,
      fieldsMatcher(fields || [], () => true, present, `${name}.`)
    );
  }

  if (frameFields.length) {
    for (const { fields, name } of frameFields
      .filter(groupFilter)
      .filter(({ name }) => !present.has(name))) {
      present.add(`frames.${name}`);
      updater(
        `frames.${name}`,
        fieldsMatcher(fields || [], () => true, present, `frames.${name}.`),
        true
      );
    }
  }

  updater("other", fieldsMatcher(sampleFields, unsupportedMatcher, present));

  updater(
    "other",
    fieldsMatcher(frameFields, () => true, present, "frames.")
  );
  return groups;
};

const groupUpdater = (
  groups: State.SidebarGroup[],
  schema: Schema,
  present: Set<string>
) => {
  const groupNames = groups.map(({ name }) => name);

  for (let i = 0; i < groups.length; i++) {
    groups[i].paths = filterPaths(groups[i].paths, schema);
  }

  return (name: string, paths: string[], expanded = false) => {
    if (paths.length === 0) return;
    for (const path of paths) present.add(path);

    const index = groupNames.indexOf(name);
    if (index < 0) {
      groups.push({ name, paths, expanded });
      groupNames.push(name);
      return;
    }

    const group = groups[index].paths;
    groups[index].paths = [...group, ...paths];
  };
};

export const sidebarGroupsDefinition = (() => {
  let configGroups: State.SidebarGroup[] = [];
  let current: State.SidebarGroup[] = [];
  return graphQLSyncFragmentAtomFamily<
    sidebarGroupsFragment$key,
    State.SidebarGroup[],
    boolean
  >(
    {
      fragments: [datasetFragment, sidebarGroupsFragment],
      keys: ["dataset"],
      sync: (modal) => !modal,
      read: (data, prev) => {
        configGroups = (data.appConfig?.sidebarGroups || []).map((group) => ({
          ...group,
          paths: [...group.paths],
        }));
        current = resolveGroups(
          collapseFields(
            readFragment(sampleFieldsFragment, data as sampleFieldsFragment$key)
              .sampleFields
          ),
          collapseFields(
            readFragment(frameFieldsFragment, data as frameFieldsFragment$key)
              .frameFields
          ),
          data?.datasetId === prev?.datasetId ? current : [],
          configGroups
        );

        return current;
      },
      default: [],
    },
    {
      effects: (modal) =>
        modal
          ? []
          : [
              ({ onSet }) => {
                onSet((next) => {
                  current = next;
                });
              },
            ],
      key: "sidebarGroupsDefinition",
    }
  );
})();

export const sidebarGroups = selectorFamily<
  State.SidebarGroup[],
  { modal: boolean; loading: boolean; filtered?: boolean; persist?: boolean }
>({
  key: "sidebarGroups",
  get:
    ({ modal, loading, filtered = true }) =>
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

      if (groupNames.includes("_label_tags")) {
        groups = groups.filter(({ name }) => name !== "_label_tags");
      }

      const tagGroupIndex = groupNames.indexOf("tags");
      groups[tagGroupIndex].paths = ["_label_tags", "tags"];

      const framesIndex = groupNames.indexOf("frame labels");
      const video = get(isVideoDataset);

      if (!loading) {
        const largeVideo = get(isLargeVideo);
        if (
          video &&
          groups[framesIndex] &&
          NONE.includes(groups[framesIndex].expanded)
        ) {
          groups[framesIndex].expanded = !largeVideo;
        }

        if (NONE.includes(groups[tagGroupIndex].expanded)) {
          groups[tagGroupIndex].expanded = true;
        }
      } else {
        if (NONE.includes(groups[tagGroupIndex].expanded)) {
          groups[tagGroupIndex].expanded = true;
        }

        if (
          video &&
          groups[framesIndex] &&
          NONE.includes(groups[framesIndex].expanded)
        ) {
          groups[framesIndex].expanded = false;
        }
      }

      return groups;
    },
  set:
    ({ modal, persist = true }) =>
    ({ set, get }, newGroups) => {
      if (newGroups instanceof DefaultValue) return;

      const allPaths = new Set(newGroups.flatMap(({ paths }) => paths));

      const groups = newGroups.map(({ name, paths, expanded }) => {
        if (["tags"].includes(name)) {
          return { name, paths: [], expanded };
        }

        const result = [];
        const current = [
          ...get(
            sidebarGroup({
              modal,
              group: name,
              loading: false,
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

        for (const path of paths) {
          result.push(path);
          if (!current.includes(path)) {
            continue;
          }

          fill(path);
        }

        fill();

        return { name, paths: result, expanded };
      });

      set(sidebarGroupsDefinition(modal), groups);

      if (groups instanceof DefaultValue) {
        return;
      }

      !modal &&
        persist &&
        persistSidebarGroups({
          subscription: get(stateSubscription),
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
  { modal: boolean; loading: boolean; filtered?: boolean }
>({
  key: "sidebarEntries",
  get:
    (params) =>
    ({ get }) => {
      const isFieldVisibility = get(isFieldVisibilityActive);
      const hidden =
        params.modal && !params.loading
          ? get(hiddenNoneGroups)
          : { groups: new Set<string>(), paths: new Set<string>() };
      const entries: SidebarEntry[] = get(sidebarGroups(params)).flatMap(
        ({ name, paths }) => {
          // if field visibility is active, return a hidden group
          if (isFieldVisibility && paths?.length === 0) {
            return {
              group: name,
              kind: EntryKind.EMPTY,
              shown: false,
            };
          }

          const group: GroupEntry = {
            name: name,
            kind: EntryKind.GROUP,
          };

          const shown = get(
            groupShown({
              group: name,
              modal: params.modal,
              loading: params.loading,
            })
          );

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
              shown: shown && !hidden.paths.has(path),
            })),
          ];
        }
      );

      // switch position of labelTag and sampleTag
      const labelTagId = entries.findIndex(
        (entry) => entry.kind === EntryKind.PATH && entry.path === "_label_tags"
      );
      const sampleTagId = entries.findIndex(
        (entry) => entry.kind === EntryKind.PATH && entry.path === "tags"
      );
      [entries[labelTagId], entries[sampleTagId]] = [
        entries[sampleTagId],
        entries[labelTagId],
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
            result.push({
              name: entry.name,
              expanded: get(
                groupShown({
                  modal: params.modal,
                  group: entry.name,
                  loading: params.loading,
                })
              ),
              paths: [],
            });
            return result;
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

/**
 * Returns a set of paths that have their checkbox disabled in the sidebar
 */
export const disabledCheckboxPaths = selector<Set<string>>({
  key: "disabledCheckboxPaths",
  get: ({ get }) => {
    return new Set(get(fullyDisabledPaths));
  },
});

/**
 * Returns a set of paths that have their filter dropdown disabled in the sidebar
 */
export const disabledFilterPaths = selector<Set<string>>({
  key: "disabledFilterPaths",
  get: ({ get }) =>
    new Set([...get(fullyDisabledPaths), ...get(disabledFrameFilterPaths)]),
});

export const disabledFrameFilterPaths = selector<Set<string>>({
  key: "disabledFrameFilterPaths",
  get: ({ get }) => {
    const paths = new Set<string>();
    const disableFrames = Boolean(get(disableFrameFiltering));
    const frameFields = get(atoms.frameFields);
    if (disableFrames) {
      for (const frame of frameFields) {
        paths.add(`frames.${frame.path}`);
      }
    }
    return new Set(paths);
  },
});

/**
 * Returns a set of paths that should have both their checkbox and filter
 * dropdown disabled in the sidebar
 */
export const fullyDisabledPaths = selector({
  key: "fullyDisabledPaths",
  get: ({ get }) => {
    const sampleFields = get(atoms.sampleFields);
    const paths = new Set(fieldsMatcher(sampleFields, unsupportedMatcher));

    for (const parent of sampleFields.filter(groupFilter)) {
      for (const path of fieldsMatcher(
        parent.fields || [],
        (field) => {
          if (field.ftype === LIST_FIELD) {
            return !VALID_PRIMITIVE_TYPES.includes(field.subfield);
          }

          if (parent.ftype === LIST_FIELD) {
            return !VALID_PRIMITIVE_TYPES.includes(field.ftype);
          }

          return (
            !VALID_PRIMITIVE_TYPES.includes(field.ftype) &&
            !LABELS.includes(field.embeddedDocType)
          );
        },
        undefined,
        `${parent.name}.`
      )) {
        paths.add(path);
      }
    }

    const frameFields = get(atoms.frameFields);
    for (const path of fieldsMatcher(
      frameFields,
      primitivesMatcher,
      undefined,
      "frames."
    )) {
      paths.add(path);
    }

    for (const parent of frameFields.filter(groupFilter)) {
      for (const path of fieldsMatcher(
        parent.fields || [],
        (field) => {
          if (parent.ftype === LIST_FIELD) {
            return true;
          }

          if (field.ftype === LIST_FIELD) {
            return true;
          }

          return !LABELS.includes(field.embeddedDocType);
        },
        undefined,
        `frames.${parent.name}.`
      )) {
        paths.add(path);
      }
    }

    return paths;
  },
});

export const isDisabledCheckboxPath = selectorFamily<boolean, string>({
  key: "isDisabledCheckboxPath",
  get:
    (path) =>
    ({ get }) =>
      get(disabledCheckboxPaths).has(path),
});

export const isDisabledFrameFilterPath = selectorFamily<boolean, string>({
  key: "isDisabledFrameFilterPath",
  get:
    (path) =>
    ({ get }) =>
      get(disabledFrameFilterPaths).has(path),
});

export const isDisabledFilterPath = selectorFamily<boolean, string>({
  key: "isDisabledFilterPath",
  get:
    (path) =>
    ({ get }) =>
      get(disabledFilterPaths).has(path),
});

export const collapsedPaths = selector<Set<string>>({
  key: "collapsedPaths",
  get: ({ get }) => {
    let paths = [...get(fieldPaths({ ftype: DICT_FIELD }))];
    paths = [
      ...paths,
      ...get(fieldPaths({ ftype: LIST_FIELD })).filter((path) =>
        UNSUPPORTED_FILTER_TYPES.includes(get(field(path)).subfield)
      ),
    ];

    for (const { fields: fieldsData, name: prefix } of get(
      fields({ ftype: EMBEDDED_DOCUMENT_FIELD, space: State.SPACE.SAMPLE })
    )) {
      for (const { name } of Object.values(fieldsData).filter(
        ({ ftype, subfield }) =>
          ftype === DICT_FIELD ||
          subfield === DICT_FIELD ||
          (ftype === LIST_FIELD && !subfield)
      )) {
        paths.push(`${prefix}.${name}`);
      }
    }

    for (const { name, embeddedDocType } of get(
      fields({ space: State.SPACE.FRAME })
    )) {
      if (LABELS.includes(embeddedDocType)) {
        continue;
      }

      paths.push(`frames.${name}`);
    }

    return new Set(paths);
  },
  cachePolicy_UNSTABLE: {
    eviction: "most-recent",
  },
});

export const sidebarGroupMapping = selectorFamily<
  { [name: string]: Omit<State.SidebarGroup, "name"> },
  { modal: boolean; loading: boolean; filtered?: boolean }
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
  { modal: boolean; group: string; loading: boolean; filtered?: boolean }
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
      return get(sidebarGroups({ modal, loading: true })).map(
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
        get(sidebarGroup({ ...params, loading: true, filtered: false }))
          .length === 0
      );
    },
  cachePolicy_UNSTABLE: {
    eviction: "most-recent",
  },
});

export const groupShown = selectorFamily<
  boolean,
  { modal: boolean; group: string; loading: boolean }
>({
  key: "groupShown",
  get:
    ({ group, modal, loading }) =>
    ({ get }) => {
      const data = get(sidebarGroupMapping({ modal, loading }))[group];

      if ([null, undefined].includes(data.expanded)) {
        if (["tags"].includes(group)) {
          return null;
        }

        return (
          !data.paths.length ||
          !data.paths.every((path) => get(collapsedPaths).has(path))
        );
      }

      return data.expanded;
    },
  set:
    ({ modal, group }) =>
    ({ get, set }, expanded) => {
      const current = get(sidebarGroups({ modal, loading: false }));
      set(
        sidebarGroups({ modal, loading: true, persist: false }),
        current.map(({ name, ...data }) =>
          name === group
            ? { name, ...data, expanded: Boolean(expanded) }
            : { name, ...data }
        )
      );
    },
});

export const labelsToggleTracker = atom({
  key: "labelsToggleTracker",
  default: new Map<GridPageNumber, SidebarEntriesSet>(),
});

export const textFilter = atomFamily<string, boolean>({
  key: "textFilter",
  default: "",
});

export const sidebarVisible = atomFamily<boolean, boolean>({
  key: "sidebarVisible",
  default: true,
  effects: (isModal) => [
    getBrowserStorageEffectForKey(`sidebarVisible-modal-${isModal}`, {
      valueClass: "boolean",
    }),
  ],
});

export const sidebarWidth = atomFamily<number, boolean>({
  key: "sidebarWidth",
  default: 300,
});

export const hiddenNoneGroups = selector({
  key: "hiddenNoneGroups",
  get: ({ get }) => {
    if (!get(atoms.hideNoneValuedFields)) {
      return { paths: new Set<string>(), groups: new Set<string>() };
    }

    const groups = get(
      sidebarGroups({ modal: true, loading: false, filtered: true })
    ).filter((group) => group.name !== "tags"); // always show tags

    let samples: { [key: string]: { sample: object } } = {
      default: { sample: get(activeModalSidebarSample) },
    };
    let slices = ["default"];

    const multipleSlices =
      Boolean(get(pinned3DSampleSlice)) &&
      (get(active3dSlices)?.length || 1) > 1;
    if (multipleSlices) {
      samples = get(active3dSlicesToSampleMap);
      slices = Array.from(get(active3dSlices) || []).sort();
    }

    const items = groups.flatMap(({ name: group, paths }) =>
      paths.map((path) => ({ group, path }))
    );

    const result = {
      groups: new Set(groups.map(({ name }) => name)),
      paths: new Set<string>(items.map(({ path }) => path)),
    };

    for (const { group, path } of items) {
      const isList = get(isOfDocumentFieldList(path));
      for (const slice of slices) {
        const keys = path.split(".");
        const data = pullSidebarValue(
          get(field(keys[0])),
          keys,
          samples[slice]?.sample,
          isList
        );

        if (data !== null && data !== undefined) {
          result.groups.delete(group);
          result.paths.delete(path);
        }
      }
    }

    return result;
  },
});

export const pullSidebarValue = (
  inputField: Pick<Field, "dbField" | "fields">,
  keys: string[],
  input: null | object | undefined,
  isList: boolean
) => {
  let data = input;
  let field = inputField;
  if (isList) {
    data = data?.[field?.dbField || keys[0]]?.map((d) => d[keys[1]]);
  } else {
    for (let index = 0; index < keys.length; index++) {
      if (data === null || data === undefined) {
        break;
      }
      const key = keys[index];
      data = data[field?.dbField || key];

      if (keys[index + 1]) {
        field = field?.fields?.[keys[index + 1]] || null;
      }
    }
  }

  if (Array.isArray(data)) {
    return data.some((d) => d !== null && d !== undefined) ? data : null;
  }

  return data;
};
