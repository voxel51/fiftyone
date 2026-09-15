import {
  selectionScopeLabel,
  subsetRequest,
  useInvalidateSelectionScope,
  useGridSelectionBoundary,
  type SavedSubset,
} from "@fiftyone/state/src/selection";
import { useClearTemporalTagConstraint } from "@fiftyone/state";
import {
  Dropdown,
  DropdownAnchor,
  DropdownTrigger,
  MenuTextItem,
  MenuSectionTitle,
  Size,
} from "@voxel51/voodo";
import { useEffect, useState } from "react";

/** Opens a frozen subset without populating or replacing explicit tray captures. */
export default function SubsetBrowser({ datasetId }: { datasetId: string }) {
  const [boundary, setBoundary] = useGridSelectionBoundary();
  const clearTemporalTags = useClearTemporalTagConstraint();
  const invalidate = useInvalidateSelectionScope(datasetId);
  const [subsets, setSubsets] = useState<readonly SavedSubset[]>([]);
  const [error, setError] = useState<string | null>(null);
  const load = async () => {
    try {
      setSubsets(
        (await subsetRequest<{ subsets: SavedSubset[] }>(datasetId, ""))
          .subsets,
      );
      setError(null);
    } catch (cause) {
      setError(String(cause));
    }
  };
  // This effect resolves the current dataset's subset names and counts.
  useEffect(() => {
    let active = true;
    subsetRequest<{ subsets: SavedSubset[] }>(datasetId, "")
      .then((value) => {
        if (active) setSubsets(value.subsets);
      })
      .catch((cause) => {
        if (active) setError(String(cause));
      });
    return () => {
      active = false;
    };
  }, [datasetId]);
  const active = subsets.find((subset) => subset.id === boundary.subsetId);
  const open = (subsetId?: string, subsetScope?: "episodes" | "segments") => {
    invalidate();
    clearTemporalTags();
    setBoundary({ subsetId, subsetScope });
  };
  return (
    <Dropdown
      anchor={DropdownAnchor.TopStart}
      trigger={
        <DropdownTrigger size={Size.Xs} onClick={load}>
          {boundary.subsetId
            ? `Subset: ${active?.name ?? "Unavailable"} · ${boundary.subsetScope === "segments" ? "Saved segments" : "Whole episodes"}`
            : "Dataset · saved subsets"}
        </DropdownTrigger>
      }
    >
      <MenuTextItem onClick={() => open()}>Entire dataset</MenuTextItem>
      {error && <MenuTextItem disabled>{error}</MenuTextItem>}
      {subsets.map((subset) => (
        <div key={subset.id}>
          <MenuSectionTitle>{`${subset.name} · ${selectionScopeLabel(subset.counts)}${subset.counts.unavailable ? ` · ${subset.counts.unavailable} unavailable` : ""}`}</MenuSectionTitle>
          {(subset.counts.fullEpisodes > 0 || !subset.counts.segments) && (
            <MenuTextItem onClick={() => open(subset.id, "episodes")}>
              Open {subset.name} · Whole episodes
            </MenuTextItem>
          )}
          {subset.counts.segments > 0 && (
            <MenuTextItem onClick={() => open(subset.id, "segments")}>
              Open {subset.name} · Saved segments
            </MenuTextItem>
          )}
        </div>
      ))}
      {!subsets.length && !error && (
        <MenuTextItem disabled>No saved subsets yet</MenuTextItem>
      )}
    </Dropdown>
  );
}
