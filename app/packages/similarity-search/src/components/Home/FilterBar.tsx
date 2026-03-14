import {
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
import { RunFilterState, DateFilterPreset, OwnerFilter } from "../../types";
import { DATE_PRESET_OPTIONS } from "../../constants";
import * as s from "../styles";

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
    filterState.searchText !== "" ||
    filterState.datePreset !== "all" ||
    filterState.ownerFilter !== "all";

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
        <div style={s.filterBarSearchCol}>
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
        <div style={s.filterBarDateCol}>
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
        <Stack orientation={Orientation.Row} spacing={Spacing.Xs}>
          <Button
            variant={
              filterState.ownerFilter === "all"
                ? Variant.Primary
                : Variant.Secondary
            }
            size={Size.Sm}
            onClick={() => onChange({ ...filterState, ownerFilter: "all" })}
          >
            All
          </Button>
          <Button
            variant={
              filterState.ownerFilter === "mine"
                ? Variant.Primary
                : Variant.Secondary
            }
            size={Size.Sm}
            onClick={() => onChange({ ...filterState, ownerFilter: "mine" })}
          >
            Mine
          </Button>
        </Stack>
      </Stack>

      {isFiltered && (
        <Text variant={TextVariant.Md} color={TextColor.Muted}>
          Showing {resultCount} of {totalCount} searches
        </Text>
      )}
    </Stack>
  );
}
