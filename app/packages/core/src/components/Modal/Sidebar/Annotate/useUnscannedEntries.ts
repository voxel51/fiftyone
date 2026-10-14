/**
 * Entries for the Annotate tab's "UNSCANNED FIELDS" group: the
 * dataset's label and primitive fields that are not yet set up for
 * annotation (explore-only). Managers get a one-click scan on each row
 * (see `UnscannedFieldEntry`); everyone else sees no group — the
 * affordance is the group's whole point. System fields (ids,
 * timestamps) and unsupported types never appear: they can't be
 * scanned into annotation.
 */

import { EntryKind, type SidebarEntry } from "@fiftyone/state";
import { atom, useAtomValue, useSetAtom } from "jotai";
import { useEffect, useMemo } from "react";
import {
  UNSCANNED_GROUP_NAME,
  unscannedCount,
  unscannedExpanded,
} from "./GroupEntry";
import { isSystemReadOnlyField } from "./SchemaManager/constants";
import { inactiveLabelSchemas, labelSchemaData } from "./state";
import useCanManageSchema from "./useCanManageSchema";

const unscannedPaths = atom((get) =>
  get(inactiveLabelSchemas).filter(
    (path) =>
      !isSystemReadOnlyField(path) && !get(labelSchemaData(path))?.unsupported,
  ),
);

const useUnscannedEntries = (): SidebarEntry[] => {
  const canManage = useCanManageSchema();
  const paths = useAtomValue(unscannedPaths);
  const expanded = useAtomValue(unscannedExpanded);
  const setCount = useSetAtom(unscannedCount);

  useEffect(() => {
    setCount(paths.length);
  }, [paths.length, setCount]);

  return useMemo(() => {
    if (!canManage || !paths.length) {
      return [];
    }
    return [
      { kind: EntryKind.GROUP, name: UNSCANNED_GROUP_NAME },
      ...paths.map((path) => ({
        kind: EntryKind.PATH,
        path,
        shown: expanded,
      })),
    ] as SidebarEntry[];
  }, [canManage, paths, expanded]);
};

export default useUnscannedEntries;
