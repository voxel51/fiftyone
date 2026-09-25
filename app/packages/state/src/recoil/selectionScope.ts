import { atom, selector, useSetRecoilState } from "recoil";
import { selectionDomainId, viewConversion } from "../selection/model";
import type { SelectionBoundary } from "../selection/types";
import { datasetId } from "./selectors";
import { view } from "./view";

const selectionScope = atom<{
  domainId: string;
  boundary: SelectionBoundary;
} | null>({
  key: "selectionScope",
  default: null,
});

/** The tray publishes after render, so its boundary may still name the old view. */
export const selectionScopeBoundary = selector<SelectionBoundary | null>({
  key: "selectionScopeBoundary",
  get: ({ get }) => {
    const scope = get(selectionScope);
    if (!scope) return null;

    const domainId = selectionDomainId(
      get(datasetId) ?? "",
      viewConversion(get(view))?.key ?? null,
    );
    return scope.domainId === domainId ? scope.boundary : null;
  },
});

/** Publishes a browsing boundary together with the dataset and view it belongs to. */
export function useSetSelectionScopeBoundary() {
  return useSetRecoilState(selectionScope);
}
