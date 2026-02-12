import { EntryKind, type SidebarEntry } from "@fiftyone/state";
import { useAtomValue } from "jotai";
import { useMemo } from "react";
import { primitivesExpanded } from "./GroupEntry";
import useSamplePrimitives from "./useSamplePrimitives";

const usePrimitiveEntries = (activeFields: string[]): SidebarEntry[] => {
  const samplePrimitives = useSamplePrimitives();
  const primitivesExpandedState = useAtomValue(primitivesExpanded);

  const primitiveEntries: SidebarEntry[] = useMemo(() => {
    // Use Map for O(1) lookup instead of repeated indexOf calls
    const orderMap = new Map(
      activeFields.map((field, index) => [field, index])
    );

    return samplePrimitives
      .filter((path) => orderMap.has(path))
      .sort((a, b) => (orderMap.get(a) ?? 0) - (orderMap.get(b) ?? 0))
      .map((path) => ({
        kind: EntryKind.PATH,
        path,
        shown: primitivesExpandedState,
      }));
  }, [samplePrimitives, activeFields, primitivesExpandedState]);

  return [{ kind: EntryKind.GROUP, name: "PRIMITIVES" }, ...primitiveEntries];
};

export default usePrimitiveEntries;
