import { FilterAndSelectionIndicator } from "@fiftyone/components";
import { useRecoilValue, useSetRecoilState } from "recoil";
import { clearSelectionNonceState, selectionCountState } from "./state";

/**
 * Selection pill in the panel's tab: shows the active plot selection's
 * size and clears it on click. Mounted by the spaces tab bar, outside
 * the panel tree, so it talks to the plot through the package atoms.
 */
export default function TabIndicator() {
  const count = useRecoilValue(selectionCountState);
  const requestClear = useSetRecoilState(clearSelectionNonceState);

  if (!count) return null;

  return (
    <FilterAndSelectionIndicator
      selectionCount={count.toLocaleString()}
      onClickSelection={() => requestClear((nonce) => nonce + 1)}
    />
  );
}
