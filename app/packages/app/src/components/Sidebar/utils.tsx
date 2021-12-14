import { useRecoilStateLoadable, useRecoilValue } from "recoil";

import { useLoading } from "../../recoil/aggregations";
import { elementNames } from "../../recoil/view";
import { sidebarEntries } from "./recoil";

export enum EntryKind {
  EMPTY = "EMPTY",
  GROUP = "GROUP",
  PATH = "PATH",
  TAIL = "TAIL",
}

export interface EmptyEntry {
  kind: EntryKind.EMPTY;
  shown: boolean;
  group: string;
}

export interface TailEntry {
  kind: EntryKind.TAIL;
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

export type SidebarEntry = EmptyEntry | GroupEntry | PathEntry | TailEntry;

export const useTagText = () => {
  const { singular } = useRecoilValue(elementNames);
  const loadingTags = useLoading({ extended: false, modal: false });

  if (loadingTags) {
    return {
      sample: `Loading ${singular} tags...`,
      label: "Loading label tags",
    };
  }

  return { sample: `No ${singular} tags`, label: "No label tags" };
};

export const useEntries = (
  modal: boolean
): [SidebarEntry[], (entries: SidebarEntry[]) => void] => {
  const loading = useLoading({ modal, extended: false });
  const [entries, setEntries] = useRecoilStateLoadable(
    sidebarEntries({ modal, loadingTags: false })
  );
  const loadingEntries = useRecoilValue(
    sidebarEntries({ modal, loadingTags: true })
  );

  return [loading ? loadingEntries : entries.contents, setEntries];
};
