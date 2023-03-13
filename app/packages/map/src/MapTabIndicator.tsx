import { FilterAndSelectionIndicator } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import { useResetExtendedSelection } from "@fiftyone/state";
import { useRecoilValue } from "recoil";
import { SELECTION_SCOPE } from "./constants";

export default function EmbeddingsTabIndicator() {
  const { selection, scope } = useRecoilValue(fos.extendedSelection);
  const resetExtendedSelection = useResetExtendedSelection();

  if (scope !== SELECTION_SCOPE) return null;

  return (
    <FilterAndSelectionIndicator
      selectionCount={selection?.length.toString()}
      onClickSelection={resetExtendedSelection}
    />
  );
}
