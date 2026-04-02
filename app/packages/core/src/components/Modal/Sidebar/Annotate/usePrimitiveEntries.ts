import { EntryKind, type SidebarEntry } from "@fiftyone/state";
import { useMemo } from "react";
import { useAnnotationSelector } from "./redux/hooks";
import useSamplePrimitives from "./useSamplePrimitives";

const usePrimitiveEntries = (activeFields: string[]): SidebarEntry[] => {
  const samplePrimitives = useSamplePrimitives();
  const primitivesExpandedState = useAnnotationSelector(
    (s) => s.annotation.primitivesExpanded
  );

  const primitiveEntries: SidebarEntry[] = useMemo(() => {
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
