import { PillButton } from "@fiftyone/components";
import { Check, FilterList } from "@mui/icons-material";
import React from "react";

const commonStyles = {
  height: "1.5rem",
  fontSize: "0.8rem",
  lineHeight: "1rem",
  padding: "0.25rem 0.5rem",
};

const iconStyles = {
  fontSize: "1.25rem",
};

export default function FilterAndSelectionIndicator({
  filterCount,
  selectionCount,
  onClickFilter,
  onClickSelection,
  filterTitle,
  selectionTitle,
}: FilterAndSelectionIndicatorProps) {
  const showFilter = filterCount !== undefined && filterCount !== null;
  const showSelection = selectionCount !== undefined && selectionCount !== null;

  if (!showFilter && !showSelection) return null;

  return (
    <div style={{ display: "flex" }}>
      {showFilter && (
        <PillButton
          icon={<FilterList sx={iconStyles} />}
          title={filterTitle || "Clear filter"}
          text={filterCount}
          onClick={onClickFilter || (() => {})}
          style={commonStyles}
        />
      )}
      {showSelection && (
        <PillButton
          icon={<Check sx={iconStyles} />}
          title={selectionTitle || "Clear selection"}
          text={selectionCount}
          onClick={onClickSelection || (() => {})}
          style={{ ...commonStyles, marginLeft: "0.25rem" }}
        />
      )}
    </div>
  );
}

type FilterAndSelectionIndicatorProps = {
  filterCount?: string;
  selectionCount?: string;
  onClickFilter?: () => void;
  onClickSelection?: () => void;
  filterTitle?: string;
  selectionTitle?: string;
};
