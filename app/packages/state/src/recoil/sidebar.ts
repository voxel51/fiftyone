import { setSidebarGroups, setSidebarGroupsMutation } from "@fiftyone/relay";
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
import { VariablesOf, commitMutation } from "react-relay";
import {
  DefaultValue,
  atomFamily,
  selector,
  selectorFamily,
  useRecoilStateLoadable,
  useRecoilValue,
} from "recoil";
import { getCurrentEnvironment } from "../hooks/useRouter";
import * as aggregationAtoms from "./aggregations";
import * as atoms from "./atoms";
import { isLargeVideo } from "./options";
import {
  buildSchema,
  fieldPaths,
  fields,
  filterPaths,
  pathIsShown,
} from "./schema";
import { datasetName, isVideoDataset, stateSubscription } from "./selectors";
import { State } from "./types";
import {
  fieldsMatcher,
  groupFilter,
  labelsMatcher,
  primitivesMatcher,
  unsupportedMatcher,
} from "./utils";
import * as viewAtoms from "./view";

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

const LABELS = withPath(LABELS_PATH, VALID_LABEL_TYPES);

const DEFAULT_IMAGE_GROUPS = [
  { name: "tags", paths: [] },
  { name: "metadata", paths: [] },
  { name: "labels", paths: [] },
  { name: "primitives", paths: [] },
];

const DEFAULT_VIDEO_GROUPS = [
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
  sidebarGroups?: State.SidebarGroup[],
  current?: State.SidebarGroup[]
): State.SidebarGroup[] => {
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
        frameFields.length ? DEFAULT_VIDEO_GROUPS : DEFAULT_IMAGE_GROUPS
      )
    );
  }

  groups = groups.map((group) => {
    return expanded[group.name] !== undefined
      ? { ...group, expanded: expanded[group.name] }
      : group;
  });

  const present = new Set<string>(groups.map(({ paths }) => paths).flat());
  const updater = groupUpdater(
    groups,
    buildSchema(sampleFields, frameFields),
    present
  );

  updater("labels", fieldsMatcher(sampleFields, labelsMatcher(), present));

  frameFields.length &&
    updater(
      "frame labels",
      fieldsMatcher(frameFields, labelsMatcher(), present, "frames.")
    );

  updater(
    "primitives",
    fieldsMatcher(sampleFields, primitivesMatcher, present)
  );

  sampleFields.filter(groupFilter).forEach(({ fields, name }) => {
    updater(
      name,
      fieldsMatcher(fields || [], () => true, present, `${name}.`)
    );
  });

  frameFields.length &&
    frameFields.filter(groupFilter).forEach(({ fields, name }) => {
      present.add(`frames.${name}`);
      updater(
        `frames.${name}`,
        fieldsMatcher(fields || [], () => true, present, `frames.${name}.`)
      );
    });

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

  return (name: string, paths: string[]) => {
    if (paths.length === 0) return;
    paths.forEach((path) => present.add(path));

    const index = groupNames.indexOf(name);
    if (index < 0) {
      groups.push({ name, paths, expanded: false });
      groupNames.push(name);
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
  { modal: boolean; loading: boolean; filtered?: boolean }
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

      // if the data migration did not happen, we want to make sure the frontend still renders in the new format
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
    ({ set, get }, groups) => {
      if (groups instanceof DefaultValue) return;

      const allPaths = new Set(groups.map(({ paths }) => paths).flat());

      groups = groups.map(({ name, paths, expanded }) => {
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

      // switch position of labelTag and sampleTag
      const labelTagId = entries.findIndex(
        (entry) => entry?.path === "_label_tags"
      );
      const sampleTagId = entries.findIndex((entry) => entry?.path === "tags");
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
    const dataset = get(atoms.dataset);
    const paths = new Set(
      fieldsMatcher(dataset.sampleFields, unsupportedMatcher)
    );

    dataset.sampleFields.filter(groupFilter).forEach((parent) => {
      fieldsMatcher(
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
      ).forEach((path) => paths.add(path));
    });

    fieldsMatcher(
      dataset.frameFields,
      primitivesMatcher,
      undefined,
      "frames."
    ).forEach((path) => paths.add(path));

    dataset.frameFields.filter(groupFilter).forEach((parent) => {
      fieldsMatcher(
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
      ).forEach((path) => paths.add(path));
    });

    return new Set(paths);
  },
});

export const isDisabledPath = selectorFamily<boolean, string>({
  key: "isDisabledPath",
  get:
    (path) =>
    ({ get }) =>
      get(disabledPaths).has(path),
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
