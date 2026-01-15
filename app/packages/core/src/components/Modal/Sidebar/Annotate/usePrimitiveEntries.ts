import { EntryKind, modalSample, type SidebarEntry } from "@fiftyone/state";
import { useAtomValue } from "jotai";
import { useMemo } from "react";
import { useRecoilValue } from "recoil";
import { primitivesExpanded } from "./GroupEntry";
import useSamplePrimitives from "./useSamplePrimitives";

const usePrimitiveEntries = (activeFields: string[]): SidebarEntry[] => {
  const currentSample = useRecoilValue(modalSample).sample;
  const samplePrimitives = useSamplePrimitives(currentSample);
  const primitivesExpandedState = useAtomValue(primitivesExpanded);

  const primitiveEntries: SidebarEntry[] = useMemo(
    () =>
      samplePrimitives
        .filter((path) => activeFields.includes(path))
        .sort((a, b) => {
          // match order to activeFields
          const indexA = activeFields.indexOf(a);
          const indexB = activeFields.indexOf(b);
          return indexA - indexB;
        })
        .map((path) => {
          return {
            kind: EntryKind.PATH,
            path,
            shown: primitivesExpandedState,
          };
        }),
    [samplePrimitives, activeFields, primitivesExpandedState]
  );

  return [{ kind: EntryKind.GROUP, name: "PRIMITIVES" }, ...primitiveEntries];
};

export default usePrimitiveEntries;
