import { PillButton } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import { ChecklistIcon } from "@voxel51/voodo";
import { useCallback } from "react";
import { useRecoilValue, useRecoilValueLoadable } from "recoil";
import Loading from "../../../Actions/Loading";
import { useSelectAllSamples } from "../../../Actions/Selected/hooks";
import type { ActionProps } from "../../../Actions/types";
import { ActionDiv, getStringAndNumberProps } from "../../../Actions/utils";

export default ({ adaptiveMenuItemProps }: ActionProps) => {
  const { selectAll, loading } = useSelectAllSamples();
  const setSelected = fos.useSetSelected();
  const selectedCount = useRecoilValue(fos.selectedSamples).size;
  const elementNames = useRecoilValue(fos.elementNames);
  const countLoadable = useRecoilValueLoadable(
    fos.count({ path: "_", extended: true, modal: false }),
  );
  const totalCount =
    countLoadable.state === "hasValue" &&
    typeof countLoadable.contents === "number"
      ? countLoadable.contents
      : null;

  const allSelected =
    totalCount !== null && totalCount > 0 && selectedCount >= totalCount;
  const empty = totalCount === 0;

  const onClick = useCallback(() => {
    if (loading || empty) {
      return;
    }

    if (allSelected) {
      setSelected(new Map());
      return;
    }

    void selectAll();
  }, [allSelected, empty, loading, selectAll, setSelected]);

  const title = empty
    ? `No ${elementNames.plural} in view`
    : allSelected
      ? `Deselect all ${elementNames.plural}`
      : `Select all ${elementNames.plural} in view`;

  return (
    <ActionDiv {...(getStringAndNumberProps(adaptiveMenuItemProps) || {})}>
      <PillButton
        icon={
          loading ? (
            <Loading />
          ) : (
            <ChecklistIcon style={{ width: "1.5rem", height: "1.5rem" }} />
          )
        }
        open={false}
        highlight={allSelected}
        onClick={onClick}
        title={title}
        aria-label={title}
        tooltipPlacement="top"
        style={{
          cursor: empty ? "not-allowed" : loading ? "default" : "pointer",
        }}
        data-cy="action-select-all"
      />
    </ActionDiv>
  );
};
