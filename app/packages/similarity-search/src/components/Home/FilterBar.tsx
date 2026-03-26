import {
  Align,
  Button,
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
  Variant,
} from "@voxel51/voodo";
import React from "react";
import { RunFilterState, DateFilterPreset } from "../../types";
import { DATE_PRESET_OPTIONS, OWNER_ALL, OWNER_MINE } from "../../constants";
import { FilterBarSearchCol, FilterBarDateCol } from "../styled";

type FilterBarProps = {
  filterState: RunFilterState;
  onChange: (state: RunFilterState) => void;
  resultCount: number;
  totalCount: number;
  canFilterByOwner: boolean;
};

export default function FilterBar({
  filterState,
  onChange,
  resultCount,
  totalCount,
  canFilterByOwner,
}: FilterBarProps) {
  const isFiltered =
    filterState.searchText !== "" ||
    filterState.datePreset !== "all" ||
    (canFilterByOwner && filterState.ownerFilter !== OWNER_ALL);

  return (
    <Stack
      orientation={Orientation.Column}
      spacing={Spacing.Sm}
      style={{ marginBottom: "0.75rem" }}
    >
      <Stack
        orientation={Orientation.Row}
        spacing={Spacing.Sm}
        align={Align.Center}
      >
        <FilterBarSearchCol>
          <Input
            type={InputType.Search}
            placeholder="Filter by name, query, or brain key..."
            value={filterState.searchText}
            onChange={(e) =>
              onChange({ ...filterState, searchText: e.target.value })
            }
            size={Size.Sm}
          />
        </FilterBarSearchCol>
        <FilterBarDateCol>
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
        </FilterBarDateCol>
        {canFilterByOwner && (
          <Stack orientation={Orientation.Row} spacing={Spacing.Xs}>
            <Button
              variant={
                filterState.ownerFilter === OWNER_ALL
                  ? Variant.Primary
                  : Variant.Secondary
              }
              size={Size.Sm}
              onClick={() =>
                onChange({ ...filterState, ownerFilter: OWNER_ALL })
              }
            >
              All
            </Button>
            <Button
              variant={
                filterState.ownerFilter === OWNER_MINE
                  ? Variant.Primary
                  : Variant.Secondary
              }
              size={Size.Sm}
              onClick={() =>
                onChange({ ...filterState, ownerFilter: OWNER_MINE })
              }
            >
              Mine
            </Button>
          </Stack>
        )}
      </Stack>

      {isFiltered && (
        <Text variant={TextVariant.Md} color={TextColor.Muted}>
          Showing {resultCount} of {totalCount} searches
        </Text>
      )}
    </Stack>
  );
}
