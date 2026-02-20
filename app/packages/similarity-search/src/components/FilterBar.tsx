import {
  Input,
  InputType,
  Select,
  Size,
  Stack,
  Text,
  TextColor,
  TextVariant,
  Orientation,
  Spacing,
} from "@voxel51/voodo";
import React from "react";
import { RunFilterState, DateFilterPreset } from "../types";
import { DATE_PRESET_OPTIONS } from "../constants";

type FilterBarProps = {
  filterState: RunFilterState;
  onChange: (state: RunFilterState) => void;
  resultCount: number;
  totalCount: number;
};

export default function FilterBar({
  filterState,
  onChange,
  resultCount,
  totalCount,
}: FilterBarProps) {
  const isFiltered =
    filterState.searchText !== "" || filterState.datePreset !== "all";

  return (
    <Stack
      orientation={Orientation.Column}
      spacing={Spacing.Sm}
      style={{ marginBottom: "0.75rem" }}
    >
      <Stack
        orientation={Orientation.Row}
        spacing={Spacing.Sm}
        style={{ alignItems: "center" }}
      >
        <div className="flex-1">
          <Input
            type={InputType.Search}
            placeholder="Filter by name, query, or brain key..."
            value={filterState.searchText}
            onChange={(e) =>
              onChange({ ...filterState, searchText: e.target.value })
            }
            size={Size.Sm}
          />
        </div>
        <div className="min-w-[10rem]">
          <Select
            exclusive
            options={DATE_PRESET_OPTIONS}
            value={filterState.datePreset}
            onChange={(value) =>
              onChange({
                ...filterState,
                datePreset: (value as DateFilterPreset) ?? "all",
              })
            }
          />
        </div>
      </Stack>

      {isFiltered && (
        <Text variant={TextVariant.Sm} color={TextColor.Muted}>
          Showing {resultCount} of {totalCount} runs
        </Text>
      )}
    </Stack>
  );
}
