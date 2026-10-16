import { OpType } from "@fiftyone/annotation/src/types";
import type {
  ClassificationOverlay,
  DetectionOverlay,
  KeypointLabel,
  KeypointOverlay,
  PolylineOverlay,
  TemporalLabel,
  TemporalOverlay,
} from "@fiftyone/lighter";
import { ClassificationLabel } from "@fiftyone/looker/src/overlays/classifications";
import { DetectionLabel } from "@fiftyone/looker/src/overlays/detection";
import { PolylineLabel } from "@fiftyone/looker/src/overlays/polyline";
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
import type {
  Field,
  Primitive,
  Schema,
  StrictField,
} from "@fiftyone/utilities";
import {
  DICT_FIELD,
  DYNAMIC_EMBEDDED_DOCUMENT_FIELD,
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
  atomFamily,
  selector,
  selectorFamily,
  useRecoilStateLoadable,
  useRecoilValueLoadable,
} from "recoil";
import { collapseFields, getCurrentEnvironment } from "../utils";
import { EVENTS_FIELD } from "../event-facets/identity";
import * as atoms from "./atoms";
import { getBrowserStorageEffectForKey } from "./customEffects";
import { filters, modalFilters } from "./filters";
import { activeModalSidebarSample } from "./groups";
import { isLargeVideo } from "./options";
import { cumulativeValues, values } from "./pathData";
import {
  active3dSlices,
  active3dSlicesToSampleMap,
  is3dPinned,
} from "./renderConfig3d.atoms";
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
  isMultimodalDataset,
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

export enum EntryKind {
  EMPTY = "EMPTY",
  EMPTY_ANNOTATIONS = "EMPTY_ANNOTATIONS",
  GROUP = "GROUP",
  INPUT = "INPUT",
  LABEL = "LABEL",
  LOADING = "LOADING",
  PATH = "PATH",
}

export interface EmptyEntry {
  kind: EntryKind.EMPTY;
  shown: boolean;
  group: string;
}

export interface EmptyAnnotationsEntry {
  kind: EntryKind.EMPTY_ANNOTATIONS;
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

export interface Label {
  path: string;
  isNew?: boolean;
}

interface GenericOverlay<T> {
  id: string;
  field: string;
  label: T;
  getLabel?: () => T;
  updateField?: (field: string) => void;
  updateLabel?: (label: T) => void;
  setSelected?: (selected: boolean) => void;
}

export interface ClassificationAnnotationLabel extends Label {
  data: ClassificationLabel;
  overlay: ClassificationOverlay;
  type: "Classification";
}

export interface DetectionAnnotationLabel extends Label {
  data: DetectionLabel;
  overlay: DetectionOverlay;
  type: "Detection";
}

export interface Detection3DAnnotationLabel extends Label {
  data: DetectionLabel;
  overlay: GenericOverlay<DetectionLabel>;
  type: "Detection";
}

export interface PolylineAnnotationLabel extends Label {
  data: PolylineLabel;
  overlay: PolylineOverlay | GenericOverlay<PolylineLabel>;
  type: "Polyline";
}

export interface KeypointAnnotationLabel extends Label {
  data: KeypointLabel;
  overlay: KeypointOverlay;
  type: "Keypoint";
}

export interface TemporalDetectionAnnotationLabel extends Label {
  data: TemporalLabel;
  overlay: TemporalOverlay;
  type: "TemporalDetection";
}

export type AnnotationLabel =
  | ClassificationAnnotationLabel
  | DetectionAnnotationLabel
  | Detection3DAnnotationLabel
  | PolylineAnnotationLabel
  | KeypointAnnotationLabel
  | TemporalDetectionAnnotationLabel;

export type AnnotationLabelData = AnnotationLabel["data"];

export interface PrimitiveValue {
  type: "Primitive";
  data: Primitive;
  path: string;
  op?: OpType;
}

export interface LabelEntry {
  kind: EntryKind.LABEL;
  id: string;
  path: string;
  /** Occurrence frame for video frame labels; absent for sample-level labels. */
  frame?: number;
}

export interface LoadingEntry {
  kind: EntryKind.LOADING;
  id: string;
}

export type SidebarEntry =
  | EmptyEntry
  | EmptyAnnotationsEntry
  | GroupEntry
  | InputEntry
  | LabelEntry
  | LoadingEntry
  | PathEntry;

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
          : values({ extended: false, modal, path: "tags" }),
      );
    },
});

export const useGridEntries = (): [
  SidebarEntry[],
  (entries: SidebarEntry[]) => void,
] => {
  const [entries, setEntries] = useRecoilStateLoadable(
    sidebarEntries({ modal: false, loading: false, filtered: true }),
  );
  const loadingEntries = useRecoilValueLoadable(
    sidebarEntries({ modal: false, loading: true, filtered: true }),
  );

  return [
    entries.state === "loading" ? loadingEntries.contents : entries.contents,
    setEntries,
  ];
};

export const useModalExplorEntries = (): [
  SidebarEntry[],
  (entries: SidebarEntry[]) => void,
] => {
  const [entries, setEntries] = useRecoilStateLoadable(
    sidebarEntries({ modal: true, loading: false, filtered: true }),
  );
  const loadingEntries = useRecoilValueLoadable(
    sidebarEntries({ modal: true, loading: true, filtered: true }),
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

export const TAGS_FIELD = "tags";
export const LABEL_TAGS_FIELD = "_label_tags";
export const TEMPORAL_TAGS_FIELD = "_temporal_tags";
export const OTHER_GROUP = "other";

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
  configGroups: State.SidebarGroup[],
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
    // Keep local expansion choices when refreshed dataset metadata arrives.
    return typeof group.expanded !== "boolean" &&
      typeof expanded[group.name] === "boolean"
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
    present,
  );

  updater(
    "labels",
    fieldsMatcher(sampleFields, labelsMatcher(), present),
    true,
  );

  frameFields.length &&
    updater(
      "frame labels",
      fieldsMatcher(frameFields, labelsMatcher(), present, "frames."),
      true,
    );

  updater(
    "primitives",
    fieldsMatcher(sampleFields, primitivesMatcher, present),
    true,
  );

  for (const { fields, name } of sampleFields
    .filter(groupFilter)
    .filter(({ name }) => !present.has(name))) {
    updater(
      name,
      fieldsMatcher(fields || [], () => true, present, `${name}.`),
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
        true,
      );
    }
  }

  updater("other", fieldsMatcher(sampleFields, unsupportedMatcher, present));

  updater(
    "other",
    fieldsMatcher(frameFields, () => true, present, "frames."),
  );
  return groups;
};

const groupUpdater = (
  groups: State.SidebarGroup[],
  schema: Schema,
  present: Set<string>,
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

/**
 * Returns `target` with every path of `source` that it lacks, each added to
 * the group of the same name (or in a new group when `target` has none),
 * so `target`'s own order and groups are kept. Returns `target` itself when
 * it lacks nothing.
 */
export const withMissingSidebarPaths = (
  target: State.SidebarGroup[],
  source: State.SidebarGroup[],
): State.SidebarGroup[] => {
  const present = new Set(target.flatMap((group) => group.paths));
  let next: State.SidebarGroup[] | null = null;

  for (const group of source) {
    const missing = group.paths.filter((path) => !present.has(path));
    if (!missing.length) continue;

    next ??= target.map((g) => ({ ...g, paths: [...g.paths] }));
    const existing = next.find((g) => g.name === group.name);
    if (existing) {
      existing.paths.push(...missing);
    } else {
      next.push({ ...group, paths: missing });
    }

    for (const path of missing) present.add(path);
  }

  return next ?? target;
};

type SidebarGroupsState = {
  datasetId: string | null;
  groups: State.SidebarGroup[];
};

const sidebarGroupsState = graphQLSyncFragmentAtomFamily<
  sidebarGroupsFragment$key,
  SidebarGroupsState,
  boolean
>(
  {
    fragments: [datasetFragment, sidebarGroupsFragment],
    keys: ["dataset"],
    sync: (modal) => !modal,
    read: (data) => {
      const sampleFields = collapseFields(
        readFragment(sampleFieldsFragment, data as sampleFieldsFragment$key)
          .sampleFields,
      );
      const frameFields = collapseFields(
        readFragment(frameFieldsFragment, data as frameFieldsFragment$key)
          .frameFields,
      );
      const configGroups = (data.appConfig?.sidebarGroups || []).map(
        (group) => ({
          ...group,
          paths: [...group.paths],
        }),
      );

      // Snapshot readers must update their own store, not a shared module cache.
      return (current) => ({
        datasetId: data.datasetId,
        groups: resolveGroups(
          sampleFields,
          frameFields,
          current.datasetId === data.datasetId ? current.groups : [],
          configGroups,
        ),
      });
    },
    default: { datasetId: null, groups: [] },
  },
  { key: "sidebarGroupsState" },
);

/** Sidebar definitions and local choices, isolated by store and modal context. */
export const sidebarGroupsDefinition = selectorFamily<
  State.SidebarGroup[],
  boolean
>({
  key: "sidebarGroupsDefinition",
  get:
    (modal) =>
    ({ get }) =>
      get(sidebarGroupsState(modal)).groups,
  set:
    (modal) =>
    ({ reset, set }, groups) => {
      const state = sidebarGroupsState(modal);
      if (groups instanceof DefaultValue) reset(state);
      else set(state, (current) => ({ ...current, groups }));
    },
});

export const sidebarGroups = selectorFamily<
  State.SidebarGroup[],
  {
    modal: boolean;
    loading: boolean;
    filtered?: boolean;
    persist?: boolean;
    flatEvents?: boolean;
  }
>({
  key: "sidebarGroups",
  get:
    ({ modal, loading, filtered = true, flatEvents = true }) =>
    ({ get }) => {
      const f = get(textFilter(modal));

      let definitions = get(sidebarGroupsDefinition(modal));
      if (
        flatEvents &&
        get(isMultimodalDataset) &&
        get(field("events"))?.ftype === DYNAMIC_EMBEDDED_DOCUMENT_FIELD
      ) {
        const legacyFilters = Object.keys(get(modal ? modalFilters : filters));
        // Keep filtered physical paths visible so saved-view filters can be
        // inspected and cleared; otherwise show the combined event facet.
        definitions = definitions.map((group) => ({
          ...group,
          paths: group.paths.filter(
            (path) =>
              path !== EVENTS_FIELD &&
              (!(path === "events" || path.startsWith("events.")) ||
                legacyFilters.some(
                  (filteredPath) =>
                    filteredPath === path ||
                    filteredPath.startsWith(`${path}.`),
                )),
          ),
        }));
        const events = definitions.find((group) => group.name === "events");
        if (events) events.paths = [EVENTS_FIELD, ...events.paths];
        else
          definitions.push({
            name: "events",
            paths: [EVENTS_FIELD],
            expanded: true,
          });
      }

      let groups = definitions
        .map(({ paths, ...rest }) => ({
          ...rest,

          paths: filtered
            ? paths.filter((path) => get(pathIsShown(path)) && path.includes(f))
            : paths,
        }))
        .filter(
          ({ name, paths }) => paths.length || name !== "other",
        ) as State.SidebarGroup[];

      if (!groups.length) return [];

      const groupNames = groups.map(({ name }) => name);

      if (groupNames.includes("_label_tags")) {
        groups = groups.filter(({ name }) => name !== "_label_tags");
      }

      const tagGroupIndex = groupNames.indexOf("tags");
      // Temporal tags need a playhead to hang an interval on, so the filter is
      // only offered where one exists (e.g. not `quickstart`).
      groups[tagGroupIndex].paths = get(atoms.supportsTemporalTags(modal))
        ? ["_label_tags", "_temporal_tags", "tags"]
        : ["_label_tags", "tags"];

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
      const definitions = get(sidebarGroupsDefinition(modal));

      const groups = newGroups.map(({ name, paths, expanded }) => {
        if (["tags"].includes(name)) {
          return { name, paths: [], expanded };
        }

        const result = [];
        // Render-only facets must never replace the stored schema paths.
        const current = (
          definitions.find((group) => group.name === name)?.paths ?? []
        ).filter((path) => path !== EVENTS_FIELD);

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
          if (path === EVENTS_FIELD) continue;
          if (current.includes(path)) fill(path);
          result.push(path);
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
  variables: VariablesOf<setSidebarGroupsMutation>,
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
            }),
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
        },
      );

      // switch position of labelTag and sampleTag
      const labelTagId = entries.findIndex(
        (entry) =>
          entry.kind === EntryKind.PATH && entry.path === "_label_tags",
      );
      const sampleTagId = entries.findIndex(
        (entry) => entry.kind === EntryKind.PATH && entry.path === "tags",
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
                }),
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
        }, [] as State.SidebarGroup[]),
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
        `${parent.name}.`,
      )) {
        paths.add(path);
      }
    }

    const frameFields = get(atoms.frameFields);
    for (const path of fieldsMatcher(
      frameFields,
      primitivesMatcher,
      undefined,
      "frames.",
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
        `frames.${parent.name}.`,
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
        UNSUPPORTED_FILTER_TYPES.includes(get(field(path))?.subfield),
      ),
    ];

    for (const { fields: fieldsData, name: prefix } of get(
      fields({ ftype: EMBEDDED_DOCUMENT_FIELD, space: State.SPACE.SAMPLE }),
    )) {
      for (const { name } of Object.values(fieldsData).filter(
        ({ ftype, subfield }) =>
          ftype === DICT_FIELD ||
          subfield === DICT_FIELD ||
          (ftype === LIST_FIELD && !subfield),
      )) {
        paths.push(`${prefix}.${name}`);
      }
    }

    for (const { name, embeddedDocType } of get(
      fields({ space: State.SPACE.FRAME }),
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
        groups.map(({ name, ...rest }) => [name, rest]),
      );
    },
});

export const sidebarGroup = selectorFamily<
  string[],
  {
    modal: boolean;
    group: string;
    loading: boolean;
    filtered?: boolean;
    flatEvents?: boolean;
  }
>({
  key: "sidebarGroup",
  get:
    ({ group, ...params }) =>
    ({ get }) => {
      const match = get(sidebarGroups(params)).filter(
        ({ name }) => name === group,
      );

      return match.length ? match[0].paths : [];
    },
  cachePolicy_UNSTABLE: {
    eviction: "most-recent",
  },
});

export const sidebarPaths = (() => {
  // groups also hold each group's expanded state; returning the same array
  // when only that changes keeps the grid's looker options unchanged
  let current: string[] = [];
  return selector({
    key: "sidebarPaths",
    get: ({ get }) => {
      const paths = get(sidebarGroupsDefinition(false)).flatMap(
        ({ paths }) => paths,
      );
      if (
        paths.length !== current.length ||
        paths.some((path, i) => path !== current[i])
      ) {
        current = paths;
      }
      return current;
    },
  });
})();

export const sidebarGroupNames = selectorFamily<string[], boolean>({
  key: "sidebarGroupNames",
  get:
    (modal) =>
    ({ get }) => {
      return get(sidebarGroups({ modal, loading: true })).map(
        ({ name }) => name,
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
          .length === 0,
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
            : { name, ...data },
        ),
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
      sidebarGroups({ modal: true, loading: false, filtered: true }),
    ).filter((group) => group.name !== "tags"); // always show tags

    let samples: { [key: string]: { sample: object } } = {
      default: { sample: get(activeModalSidebarSample) },
    };
    let slices = ["default"];

    const multipleSlices =
      Boolean(get(is3dPinned)) && (get(active3dSlices)?.length || 1) > 1;
    if (multipleSlices) {
      samples = get(active3dSlicesToSampleMap);
      slices = Array.from(get(active3dSlices) || []).sort();
    }

    const items = groups.flatMap(({ name: group, paths }) =>
      paths.map((path) => ({ group, path })),
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
          isList,
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
  isList: boolean,
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
