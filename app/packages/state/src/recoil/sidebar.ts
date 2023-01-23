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
  field,
  fieldPaths,
  fields,
  filterPaths,
  pathIsShown,
} from "./schema";

import { State } from "./types";
import * as viewAtoms from "./view";
import { datasetName, isVideoDataset, stateSubscription } from "./selectors";
import { isLargeVideo, resolvedSidebarMode } from "./options";
import { commitMutation, VariablesOf } from "react-relay";
import { setSidebarGroups, setSidebarGroupsMutation } from "@fiftyone/relay";
import { getCurrentEnvironment } from "../hooks/useRouter";

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
  const loading =
    useRecoilValueLoadable(readableTags({ modal, group: "label tags" }))
      .state === "loading";

  return { text: loading ? "Loading label tags" : "No label tags", loading };
};

export const useTagText = (modal: boolean) => {
  const { singular } = useRecoilValue(viewAtoms.elementNames);
  const loading =
    useRecoilValueLoadable(readableTags({ modal, group: "tags" })).state ===
    "loading";

  return {
    text: loading ? `Loading ${singular} tags` : `No ${singular} tags`,
    loading,
  };
};

export const useEntries = (
  modal: boolean
): [SidebarEntry[], (entries: SidebarEntry[]) => void] => {
  const [entries, setEntries] = useRecoilStateLoadable(
    sidebarEntries({ modal, loading: false, filtered: true })
  );
  const loadingEntries = useRecoilValue(
    sidebarEntries({ modal, loading: true, filtered: true })
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
  { name: "all tags", paths: [] },
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
  { name: "all tags", paths: [] },
  { name: "metadata", paths: [] },
  { name: "labels", paths: [] },
  { name: "frame labels", paths: [] },
  { name: "primitives", paths: [] },
  { name: "other", paths: [] },
];

const NONE = [null, undefined];

export const resolveGroups = (
  dataset: State.Dataset,
  current?: State.SidebarGroup[]
): State.SidebarGroup[] => {
  const sidebarGroups = dataset?.appConfig?.sidebarGroups;

  // TODO: hard code side bar to combine tags and label tags into one group
  console.info("appconfig", sidebarGroups);
  console.info("current", current);
  let groups = sidebarGroups
    ? JSON.parse(JSON.stringify(sidebarGroups))
    : undefined;

  const expanded = current
    ? current.reduce((map, { name, expanded }) => {
        map[name] = expanded;
        return map;
      }, {})
    : {};
  if (!groups) {
    groups = JSON.parse(
      JSON.stringify(
        dataset.frameFields.length ? DEFAULT_VIDEO_GROUPS : DEFAULT_IMAGE_GROUPS
      )
    );
  }
  console.info(groups);

  groups = groups.map((group) => {
    return expanded[group.name] !== undefined
      ? { ...group, expanded: expanded[group.name] }
      : group;
  });

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

  console.info("sampleFields", fields);

  let other = dataset.sampleFields.reduce(
    fieldsReducer([DICT_FIELD, null, undefined]),
    []
  );

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
          .reduce(fieldsReducer([DICT_FIELD, null, undefined]), [])
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
  console.info("resolve groups", groups);
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
  { modal: boolean; loading: boolean; filtered?: boolean; persist?: boolean }
>({
  key: "sidebarGroups",
  get:
    ({ modal, loading, filtered = true, persist = true }) =>
    ({ get }) => {
      const f = get(textFilter(modal));
      const groupDef = get(sidebarGroupsDefinition(modal));
      console.info(groupDef);
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
      // TODO: may need to rename all tags after it's done. Need to use it now to differient between tags (which is sample tags)
      const newTagGroupIndex = groupNames.indexOf("all tags");
      const tagsIndex = groupNames.indexOf("tags");
      const labelTagsIndex = groupNames.indexOf("label tags");

      const framesIndex = groupNames.indexOf("frame labels");
      const video = get(isVideoDataset);
      console.info(groups);

      if (!loading) {
        const largeVideo = get(isLargeVideo);
        if (
          video &&
          groups[framesIndex] &&
          NONE.includes(groups[framesIndex].expanded)
        ) {
          groups[framesIndex].expanded = !largeVideo;
        }
        // add same logic for new tag group
        if (NONE.includes(groups[newTagGroupIndex].expanded)) {
          groups[newTagGroupIndex].expanded =
            get(resolvedSidebarMode(false)) === "all";
        }
        // later will need to figure out whether how to determine mode of this new group based on the mode;

        if (NONE.includes(groups[tagsIndex].expanded)) {
          groups[tagsIndex].expanded =
            get(resolvedSidebarMode(false)) === "all";
        }
        if (NONE.includes(groups[labelTagsIndex].expanded)) {
          groups[labelTagsIndex].expanded =
            get(resolvedSidebarMode(false)) === "all" ? !largeVideo : false;
        }

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

        groups[newTagGroupIndex].expanded &&
          (groups[newTagGroupIndex].paths = ["_label_tags", "tags"]);
      } else {
        if (NONE.includes(groups[newTagGroupIndex].expanded)) {
          groups[newTagGroupIndex].expanded = false;
        }
        // TODO: need to delete the following two once all done;
        if (NONE.includes(groups[tagsIndex].expanded)) {
          groups[tagsIndex].expanded = false;
        }
        if (NONE.includes(groups[labelTagsIndex].expanded)) {
          groups[labelTagsIndex].expanded = false;
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
    ({ set, get }, groups) => {
      if (groups instanceof DefaultValue) return;

      const allPaths = new Set(groups.map(({ paths }) => paths).flat());

      groups = groups.map(({ name, paths, expanded }) => {
        if (["tags", "label tags", "all tags"].includes(name)) {
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
      const entries = [
        { type: "filter", kind: EntryKind.INPUT } as InputEntry,
        ...get(sidebarGroups(params))
          .map(({ name, paths }) => {
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
                shown,
              })),
            ];
          })
          .flat(),
      ];
      const x = get(sidebarGroups(params));
      console.info(x);
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
                  groupShown({
                    modal: params.modal,
                    group: entry.name,
                    loading: params.loading,
                  })
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
    let paths = [...get(fieldPaths({ ftype: DICT_FIELD }))];
    paths = [
      ...paths,
      ...get(fieldPaths({ ftype: LIST_FIELD })).filter(
        (path) => !get(field(path)).subfield
      ),
    ];

    get(
      fields({ ftype: EMBEDDED_DOCUMENT_FIELD, space: State.SPACE.SAMPLE })
    ).forEach(({ fields, name: prefix }) => {
      Object.values(fields)
        .filter(
          ({ ftype, subfield }) =>
            ftype === DICT_FIELD ||
            subfield === DICT_FIELD ||
            (ftype === LIST_FIELD && !subfield)
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

const collapsedPaths = selector<Set<string>>({
  key: "collapsedPaths",
  get: ({ get }) => {
    let paths = [...get(fieldPaths({ ftype: DICT_FIELD }))];
    paths = [...paths, ...get(fieldPaths({ ftype: LIST_FIELD }))];

    get(
      fields({ ftype: EMBEDDED_DOCUMENT_FIELD, space: State.SPACE.SAMPLE })
    ).forEach(({ fields, name: prefix }) => {
      Object.values(fields)
        .filter(
          ({ ftype, subfield }) =>
            ftype === DICT_FIELD ||
            subfield === DICT_FIELD ||
            (ftype === LIST_FIELD && !subfield)
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
          .length == 0
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
        if (["tags", "label tags"].includes(group)) {
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

      const def = get(sidebarGroupsDefinition(modal));
      const tags = def.filter((e) => e.name === "tags")[0];
      const labelTags = def.filter((e) => e.name === "label tags")[0];
      set(
        sidebarGroups({ modal, loading: true, persist: false }),
        current.map(({ name, ...data }) =>
          name === group
            ? { name, ...data, expanded: Boolean(expanded) }
            : name === "tags"
            ? { name, ...data, expanded: tags.expanded }
            : name === "label tags"
            ? { name, ...data, expanded: labelTags.expanded }
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
