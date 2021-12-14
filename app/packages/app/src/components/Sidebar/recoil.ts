import { Field } from "@fiftyone/utilities";
import { atom, atomFamily, DefaultValue, selectorFamily } from "recoil";

import * as aggregationAtoms from "../../recoil/aggregations";
import {
  EMBEDDED_DOCUMENT_FIELD,
  LABELS_PATH,
  LABEL_DOC_TYPES,
  LIST_FIELD,
  VALID_LABEL_TYPES,
  VALID_PRIMITIVE_TYPES,
  withPath,
} from "../../recoil/constants";
import * as schemaAtoms from "../../recoil/schema";
import { State } from "../../recoil/types";

import {
  EmptyEntry,
  EntryKind,
  GroupEntry,
  PathEntry,
  SidebarEntry,
  TailEntry,
} from "./utils";

export const groupShown = atomFamily<boolean, { name: string; modal: boolean }>(
  {
    key: "sidebarGroupShown",
    default: true,
  }
);

const datasetFieldsReducer = (ftypes: string[], docTypes: string[]) => (
  acc: string[],
  { ftype, subfield, embeddedDocType, name, fields }: Field
): string[] => {
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

    return [
      ...acc,
      ...Object.entries(fields).reduce((p, [subfieldName, f]) => {
        let subftype = f.ftype;

        if (subftype === LIST_FIELD) {
          subftype = f.subfield;
        }

        if (ftypes.includes(subftype)) {
          return [...p, `${name}.${subfieldName}`];
        }

        return p;
      }, []),
    ];
  }

  return acc;
};

const LABELS = withPath(LABELS_PATH, VALID_LABEL_TYPES);

const DEFAULT_IMAGE_GROUPS = [
  ["tags", []],
  ["label tags", []],
  ["metadata", []],
  ["labels", []],
  ["primitives", []],
];

const DEFAULT_VIDEO_GROUPS = [
  ["tags", []],
  ["label tags", []],
  ["metadata", []],
  ["labels", []],
  ["frame labels", []],
  ["primitives", []],
];

export const resolveGroups = (dataset: State.Dataset): State.SidebarGroups => {
  const sidebarPaths = new Set<string>(
    (dataset.appSidebarGroups || []).reduce(
      (acc, [_, fields]) => [...acc, ...fields],
      []
    )
  );

  const primitves = dataset.sampleFields.reduce(
    datasetFieldsReducer(VALID_PRIMITIVE_TYPES, []),
    []
  );

  const labels = dataset.sampleFields.reduce(
    datasetFieldsReducer([], LABELS),
    []
  );

  const frameLabels = dataset.frameFields
    .reduce(datasetFieldsReducer([], LABELS), [])
    .map((path) => `frames.${path}`);

  const groups = [
    ...(dataset.appSidebarGroups
      ? dataset.appSidebarGroups
      : dataset.frameFields.length
      ? DEFAULT_VIDEO_GROUPS
      : DEFAULT_IMAGE_GROUPS),
  ] as State.SidebarGroups;

  const updater = groupUpdater(groups);

  updater("labels", labels);
  dataset.frameFields.length && updater("frame labels", frameLabels);
  updater("primitives", primitves);

  return groups;
};

const groupUpdater = (groups: State.SidebarGroups) => {
  const groupNames = groups.map(([name]) => name);

  return (name: string, paths: string[]) => {
    let index = groupNames.indexOf(name);

    if (index < 0) {
      groups.push(["labels", []]);
      index = groups.length - 1;
    }

    groups[index][1] = groups[index][1].filter((name) => paths.includes(name));

    const group = groups[index][1];
    groups[index][1] = [
      ...group,
      ...paths.filter((path) => !group.includes(path)).sort(),
    ];
  };
};

export const sidebarGroupsDefinition = atom<State.SidebarGroups>({
  key: "sidebarGroupsDefinition",
  default: [],
});

const sidebarGroups = selectorFamily<
  State.SidebarGroups,
  { modal: boolean; loadingTags: boolean }
>({
  key: "defaultSidebarGroups",
  get: ({ modal, loadingTags }) => ({ get }) => {
    const groups = [...get(sidebarGroupsDefinition)];
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
});

export const sidebarEntries = selectorFamily<
  SidebarEntry[],
  { modal: boolean; loadingTags: boolean }
>({
  key: "sidebarEntries",
  get: (params) => ({ get }) => {
    const entries = [
      ...get(sidebarGroups(params))
        .map(([groupName, paths]) => {
          const group: GroupEntry = { name: groupName, kind: EntryKind.GROUP };
          const shown = get(
            groupShown({ name: groupName, modal: params.modal })
          );

          return [
            group,
            ...paths.map<PathEntry>((path) => ({
              path,
              kind: EntryKind.PATH,
              shown,
            })),
            {
              kind: EntryKind.EMPTY,
              shown: paths.length === 0 && shown,
              group: groupName,
            } as EmptyEntry,
          ];
        })
        .flat(),
    ];

    if (params.loadingTags) {
    }

    if (params.modal) {
      return entries;
    }

    return [...entries, { kind: EntryKind.TAIL } as TailEntry];
  },
  set: (modal) => ({ get, set }, value) => {
    if (value instanceof DefaultValue) {
      set(sidebarGroups(modal), get(defaultSidebarGroups(modal)));
      return;
    }

    set(
      sidebarGroups(modal),
      value.reduce((result, entry) => {
        if (entry.kind === EntryKind.GROUP) {
          return [...result, [entry.name, []]];
        }

        if (entry.kind === EntryKind.PATH) {
          result[result.length - 1][1] = [
            ...result[result.length - 1][1],
            entry.path,
          ];
        }

        return result;
      }, [])
    );
  },
});

export const sidebarGroup = selectorFamily<
  string[],
  { modal: boolean; group: string; loadingTags: boolean }
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
