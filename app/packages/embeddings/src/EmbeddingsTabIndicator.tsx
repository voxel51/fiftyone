import { FilterAndSelectionIndicator } from "@fiftyone/components";
import { useReverbValue } from "@fiftyone/reverb";
import * as fos from "@fiftyone/state";
import { SELECTION_SCOPE } from "./constants";
import { usePlotSelection } from "./usePlotSelection";

export default function EmbeddingsTabIndicator() {
  const { selection, scope } = useReverbValue(fos.extendedSelection);
  const plotSelection = usePlotSelection();

  if (scope !== SELECTION_SCOPE) return null;

  return (
    <FilterAndSelectionIndicator
      selectionCount={selection?.length.toString()}
      onClickSelection={plotSelection.clearSelection}
    />
  );
}
