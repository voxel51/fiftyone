import type { SidebarEntry } from "@fiftyone/state";
import {
  EntryKind,
  State,
  activeModalSidebarSample,
  fieldPaths,
} from "@fiftyone/state";
import { VALID_PRIMITIVE_TYPES } from "@fiftyone/utilities";
import { getDefaultStore, useAtomValue } from "jotai";
import { get } from "lodash";
import { useMemo } from "react";
import { useRecoilValue } from "recoil";
import { primitivesExpanded } from "./GroupEntry";
import { activeLabelSchemas } from "./state";
import { LabelsState, labelAtoms, labelsState } from "./useLabels";

const store = getDefaultStore();

const getPrimitiveEntries = (
  currentSample: any,
  primitivePaths: string[],
  expanded: boolean
): SidebarEntry[] => {
  if (!currentSample) {
    return [];
  }

  const primitivesWithValues: string[] = [];
  for (const path of primitivePaths) {
    // Check if the field has a value in the current sample
    const value = get(currentSample, path);
    if (value !== null && value !== undefined && value !== "") {
      primitivesWithValues.push(path);
    }
  }

  if (primitivesWithValues.length === 0) {
    return [];
  }

  const result: SidebarEntry[] = [];
  // Add the group entry
  result.push({ kind: EntryKind.GROUP, name: "Primitives" });
  // Add path entries for each primitive field
  for (const path of primitivesWithValues.sort()) {
    result.push({
      kind: EntryKind.PATH,
      path,
      shown: expanded,
    });
  }

  return result;
};

const useEntries = (): [SidebarEntry[], (entries: SidebarEntry[]) => void] => {
  const atoms = useAtomValue(labelAtoms);
  const activeFields = useAtomValue(activeLabelSchemas);
  const state = useAtomValue(labelsState);
  const currentSample = useRecoilValue(activeModalSidebarSample);
  const primitivePaths = useRecoilValue(
    fieldPaths({
      space: State.SPACE.SAMPLE,
      ftype: VALID_PRIMITIVE_TYPES,
    })
  );
  const primitivesExpandedState = useAtomValue(primitivesExpanded);

  const entries = useMemo(() => {
    if (state !== LabelsState.COMPLETE) {
      return [{ kind: EntryKind.LOADING }] as SidebarEntry[];
    }

    const labelsByField: Record<
      string,
      Array<{ atom: typeof atoms[0]; id: string; label: string }>
    > = {};

    for (const atomItem of atoms) {
      const labelData = store.get(atomItem);
      const field = labelData.path;
      if (!labelsByField[field]) {
        labelsByField[field] = [];
      }
      labelsByField[field].push({
        atom: atomItem,
        id: labelData.overlay.id,
        label: labelData.data?.label ?? "",
      });
    }

    for (const field in labelsByField) {
      labelsByField[field].sort((a, b) => a.label.localeCompare(b.label));
    }

    const result: SidebarEntry[] = [];
    const fieldsToShow = activeFields ?? Object.keys(labelsByField);

    for (const field of fieldsToShow) {
      const fieldLabels = labelsByField[field];
      if (!fieldLabels?.length) continue;

      for (const { atom, id } of fieldLabels) {
        result.push({ kind: EntryKind.LABEL, atom, id });
      }
    }

    const primitiveEntries = getPrimitiveEntries(
      currentSample,
      primitivePaths,
      primitivesExpandedState
    );
    result.push(...primitiveEntries);

    return result as SidebarEntry[];
  }, [
    atoms,
    activeFields,
    state,
    currentSample,
    primitivePaths,
    primitivesExpandedState,
  ]);

  return [entries, () => {}];
};

export default useEntries;
