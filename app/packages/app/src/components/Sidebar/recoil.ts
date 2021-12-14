import { atomFamily, DefaultValue, selectorFamily } from "recoil";

import * as aggregationAtoms from "../../recoil/aggregations";
import {
  EMBEDDED_DOCUMENT_FIELD,
  LABELS_PATH,
  LABEL_DOC_TYPES,
  VALID_PRIMITIVE_TYPES,
  withPath,
} from "../../recoil/constants";
import * as schemaAtoms from "../../recoil/schema";
import { isVideoDataset } from "../../recoil/selectors";
import { State } from "../../recoil/types";

import {
  EmptyEntry,
  EntryKind,
  GroupEntry,
  PathEntry,
  SidebarEntry,
  SidebarGroups,
  TailEntry,
} from "./utils";

export const groupShown = atomFamily<boolean, { name: string; modal: boolean }>(
  {
    key: "sidebarGroupShown",
    default: true,
  }
);

const prioritySort = (
  groups: { [key: string]: string[] },
  priorities: string[]
): SidebarGroups => {
  return Object.entries(groups).sort(
    ([a], [b]) => priorities.indexOf(a) - priorities.indexOf(b)
  );
};

const defaultSidebarGroups = selectorFamily<
  SidebarGroups,
  { modal: boolean; loadingTags: boolean }
>({
  key: "defaultSidebarGroups",
  get: ({ modal, loadingTags }) => ({ get }) => {
    const video = get(isVideoDataset);
    const frameLabels = get(
      schemaAtoms.labelFields({ space: State.SPACE.FRAME })
    );
    const sampleLabels = get(
      schemaAtoms.labelFields({ space: State.SPACE.SAMPLE })
    );
    const primitives = get(
      schemaAtoms.fieldPaths({
        ftype: VALID_PRIMITIVE_TYPES,
        space: State.SPACE.SAMPLE,
      })
    ).filter((field) => field !== "tags" && (!video || field !== "frames"));

    const otherSampleFields = get(
      schemaAtoms.fieldPaths({
        space: State.SPACE.SAMPLE,
        ftype: EMBEDDED_DOCUMENT_FIELD,
      })
    ).filter((path) => ![...frameLabels, ...sampleLabels].includes(path));

    const groups = {
      tags: [],
      "label tags": [],
      labels: sampleLabels,
      primitives,
      ...otherSampleFields.reduce((other, current) => {
        other[current] = get(
          schemaAtoms.fieldPaths({
            path: current,
            ftype: VALID_PRIMITIVE_TYPES,
          })
        );
        return other;
      }, {}),
    };

    if (frameLabels.length) {
      groups["frame labels"] = frameLabels;
    }

    if (!loadingTags) {
      groups.tags = get(
        aggregationAtoms.values({ extended: false, modal, path: "tags" })
      ).map((tag) => `tags.${tag}`);
      groups["label tags"] = get(
        aggregationAtoms.cumulativeValues({
          extended: false,
          modal: false,
          path: "tags",
          ftype: EMBEDDED_DOCUMENT_FIELD,
          embeddedDocType: withPath(LABELS_PATH, LABEL_DOC_TYPES),
        })
      ).map((tag) => `_label_tags.${tag}`);
    }

    return prioritySort(groups, [
      "metadata",
      "labels",
      "frame labels",
      "primitives",
    ]);
  },
});

export const sidebarGroups = atomFamily<
  SidebarGroups,
  { loadingTags: boolean; modal: boolean }
>({
  key: "sidebarGroups",
  default: [],
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
