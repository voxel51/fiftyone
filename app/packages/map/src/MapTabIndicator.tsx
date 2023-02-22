import { FilterAndSelectionIndicator } from "@fiftyone/components";
import { useRecoilValue, useResetRecoilState } from "recoil";
import * as fos from "@fiftyone/state";
import { SELECTION_SCOPE } from "./constants";

export default function EmbeddingsTabIndicator() {
  const { selection, scope } = useRecoilValue(fos.extendedSelection);
  const resetSelection = useResetRecoilState(fos.extendedSelection);

  if (scope !== SELECTION_SCOPE) return null;

  return (
    <FilterAndSelectionIndicator
      selectionCount={selection?.length.toString()}
      onClickSelection={resetSelection}
    />
  );
}
