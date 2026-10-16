import type {
  GridSelectionAction,
  GridSelectionActionProps,
} from "@fiftyone/multimodal/extensions/grid-selection";
import { SearchIcon } from "@voxel51/voodo";
import { useState } from "react";
import useSimilarityPopover from "../../Actions/Similarity/useSimilarityPopover";
import { useAvailableSimilarityKeys } from "../../Actions/Similarity/utils";
import ActionEntry from "./ActionEntry";
import SimilaritySettings from "./SimilaritySettings";

const noop = () => undefined;

function SimilaritySelection(props: GridSelectionActionProps) {
  const keys = useAvailableSimilarityKeys(false, true);
  if (!keys?.length) {
    return (
      <ActionEntry
        label="Find similar"
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
  const { handleSearch, resolvedBrainKey } = useSimilarityPopover({
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
      label="Find similar"
      icon={SearchIcon}
      surface={surface}
      disabledReason={
        disabledReason ??
        (!resolvedBrainKey ? "No similarity index is available" : null)
      }
      busy={searching}
      busyLabel="Finding similar…"
      onClick={handleSearch}
    />
  );
}

/** Settings live below the overflow actions, independent of selection scope. */
export function SelectionSimilaritySettings({
  onClose,
}: {
  onClose: () => void;
}) {
  const keys = useAvailableSimilarityKeys(false, true);
  return keys?.length ? (
    <AvailableSimilaritySettings onClose={onClose} />
  ) : null;
}

function AvailableSimilaritySettings({ onClose }: { onClose: () => void }) {
  const { indexes, resolvedBrainKey, setBrainKey, k, setK, handleOpenPanel } =
    useSimilarityPopover({ modal: false, isImageSearch: true, close: onClose });
  return (
    <SimilaritySettings
      indexes={indexes}
      selectedKey={resolvedBrainKey}
      onSelectKey={setBrainKey}
      k={k}
      onChangeK={setK}
      onOpenPanel={handleOpenPanel}
    />
  );
}

/** Search captured samples with an available similarity index. */
export const similaritySelectionAction: GridSelectionAction = {
  id: "fiftyone:find-similar",
  order: 15,
  label: "Find similar",
  placement: "primary",
  supports: () => true,
  scope: "explicit",
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
