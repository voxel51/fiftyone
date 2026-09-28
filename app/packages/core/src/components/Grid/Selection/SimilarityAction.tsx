import type {
  GridSelectionAction,
  GridSelectionActionProps,
} from "@fiftyone/multimodal/extensions/grid-selection";
import { SearchIcon } from "@voxel51/voodo";
import { useState } from "react";
import useSimilarityPopover from "../../Actions/Similarity/useSimilarityPopover";
import { useAvailableSimilarityKeys } from "../../Actions/Similarity/utils";
import ActionEntry from "./ActionEntry";

const noop = () => undefined;

function SimilaritySelection(props: GridSelectionActionProps) {
  const keys = useAvailableSimilarityKeys(false, true);
  if (!keys?.length) {
    return (
      <ActionEntry
        label="Find Similar"
        icon={SearchIcon}
        surface={props.surface}
        disabledReason={
          keys === null
            ? "Loading similarity indexes"
            : "Create a similarity index to find similar samples."
        }
        onClick={noop}
      />
    );
  }
  return <AvailableSimilaritySelection {...props} />;
}

function AvailableSimilaritySelection({
  context,
  disabledReason,
  surface,
}: GridSelectionActionProps) {
  const [searching, setSearching] = useState(false);
  const { handleSearch, handleOpenPanel } = useSimilarityPopover({
    modal: false,
    isImageSearch: true,
    close: noop,
    // A bucket is an independent scope; never read another bucket's
    // positive/negative selection when searching from this action.
    query: { queryIds: context.groups.map((group) => group.episodeId) },
    onSearchStart: () => setSearching(true),
    onSearchEnd: () => setSearching(false),
  });

  return (
    <ActionEntry
      label="Find Similar"
      icon={SearchIcon}
      surface={surface}
      disabledReason={disabledReason}
      busy={searching}
      busyLabel="Finding similar…"
      onClick={context.source === "explicit" ? handleSearch : handleOpenPanel}
    />
  );
}

/** Search captured samples, or open search setup for the current grid. */
export const similaritySelectionAction: GridSelectionAction = {
  id: "fiftyone:find-similar",
  order: 15,
  label: "Find Similar",
  placement: "primary",
  supports: () => true,
  scope: "explicit-or-results",
  memberKinds: ["episode"],
  unavailable: (context) => {
    if (context.counts.unavailable)
      return `Remove unavailable ${context.unit.many} before searching`;
    // A dynamic group's card names a representative, not its full membership.
    if (context.groups.some((group) => group.group))
      return "Open a group and select samples to find similar.";
    return null;
  },
  Component: SimilaritySelection,
};
