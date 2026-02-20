import Search from "@mui/icons-material/Search";
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

type FilterBarProps = {
  filterState: RunFilterState;
  onChange: (state: RunFilterState) => void;
  resultCount: number;
  totalCount: number;
};

const SearchIcon = () => <Search fontSize="small" />;

const DATE_PRESET_OPTIONS = [
  { id: "all", data: { label: "All time" } },
  { id: "today", data: { label: "Today" } },
  { id: "last_7_days", data: { label: "Last 7 days" } },
  { id: "last_30_days", data: { label: "Last 30 days" } },
  { id: "older_than_30_days", data: { label: "Older than 30 days" } },
];

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
        <div style={{ flex: 1 }}>
          <Input
            type={InputType.Search}
            placeholder="Filter by name, query, or brain key..."
            value={filterState.searchText}
            onChange={(e) =>
              onChange({ ...filterState, searchText: e.target.value })
            }
            size={Size.Sm}
            icon={SearchIcon}
          />
        </div>
        <div style={{ minWidth: "10rem" }}>
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
