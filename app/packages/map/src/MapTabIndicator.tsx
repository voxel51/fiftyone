import { FilterAndSelectionIndicator } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import { useResetExtendedSelection } from "@fiftyone/state";
import { useReverbValue } from "@fiftyone/reverb";
import { SELECTION_SCOPE } from "./constants";

export default function MapTabIndicator() {
  const { selection, scope } = useReverbValue(fos.extendedSelection);
  const resetExtendedSelection = useResetExtendedSelection();

  if (scope !== SELECTION_SCOPE) return null;

  return (
    <FilterAndSelectionIndicator
      selectionCount={selection?.length.toString()}
      onClickSelection={resetExtendedSelection}
    />
  );
}
