import { useRecoilStateLoadable, useRecoilValue } from "recoil";

import {
  EMBEDDED_DOCUMENT_FIELD,
  LABELS_PATH,
  LABEL_DOC_TYPES,
  withPath,
} from "@fiftyone/utilities";

import { useLoading } from "../../recoil/aggregations";
import { elementNames } from "../../recoil/view";
import { sidebarEntries } from "./recoil";

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

export const useTagText = (modal: boolean) => {
  const { singular } = useRecoilValue(elementNames);
  const loadingTags = useLoading({ extended: false, modal });

  if (loadingTags) {
    return {
      sample: `Loading ${singular} tags...`,
      label: "Loading label tags...",
    };
  }

  return { sample: `No ${singular} tags`, label: "No label tags" };
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
  if (name.length) {
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
