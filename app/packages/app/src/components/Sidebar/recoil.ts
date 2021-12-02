import { atomFamily, DefaultValue, selectorFamily } from "recoil";

import * as aggregationAtoms from "../../recoil/aggregations";
import {
  EMBEDDED_DOCUMENT_FIELD,
  VALID_PRIMITIVE_TYPES,
} from "../../recoil/constants";
import * as schemaAtoms from "../../recoil/schema";
import { State } from "../../recoil/types";

import { SidebarEntry, SidebarGroups } from "./utils";

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

const defaultSidebarGroups = selectorFamily<SidebarGroups, boolean>({
  key: "defaultSidebarGroups",
  get: (modal) => ({ get }) => {
    const frameLabels = get(
      schemaAtoms.labelFields({ space: State.SPACE.FRAME })
    );
    const sampleLabels = get(
      schemaAtoms.labelFields({ space: State.SPACE.SAMPLE })
    );
    const labels = [...frameLabels, ...sampleLabels];

    const otherSampleFields = get(
      schemaAtoms.fieldPaths({
        space: State.SPACE.SAMPLE,
        ftype: EMBEDDED_DOCUMENT_FIELD,
      })
    ).filter((path) => !labels.includes(path));

    const tags = get(
      aggregationAtoms.values({ extended: false, modal, path: "tags" })
    );

    const groups = {
      tags,
      labels: sampleLabels,
      primitives: get(
        schemaAtoms.fieldPaths({
          ftype: VALID_PRIMITIVE_TYPES,
          space: State.SPACE.SAMPLE,
        })
      ),
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

    return prioritySort(groups, [
      "metadata",
      "labels",
      "frame labels",
      "primitives",
    ]);
  },
});

const sidebarGroups = atomFamily<SidebarGroups, boolean>({
  key: "sidebarGroups",
  default: defaultSidebarGroups,
});

export const sidebarEntries = selectorFamily<SidebarEntry[], boolean>({
  key: "sidebarEntries",
  get: (modal) => ({ get }) => {
    return [
      ...get(sidebarGroups(modal))
        .map(([groupName, paths]) => {
          const group: GroupEntry = { name: groupName, kind: EntryKind.GROUP };
          const shown = get(groupShown({ name: groupName, modal }));

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
      { kind: EntryKind.TAIL } as TailEntry,
    ];
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
  { modal: boolean; group: string }
>({
  key: "sidebarGroup",
  get: (params) => ({ get }) => {
    return get(sidebarGroups(params.modal)).filter(
      ([name]) => name === params.group
    )[0][1];
  },
});

export const sidebarGroupNames = selectorFamily<string[], boolean>({
  key: "sidebarGroupNames",
  get: (modal) => ({ get }) => {
    return get(sidebarGroups(modal)).map(([name]) => name);
  },
});
