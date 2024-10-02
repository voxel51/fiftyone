import useGroupsSearch from "@fiftyone/hooks/src/group/useSearchGroup";
import { Selection } from "@fiftyone/teams-components";
import { GROUPS_SORT_OPTIONS, SortT } from "@fiftyone/teams-state";
import { useMemo } from "react";

export default function SortControll() {
  const { field, direction, setSort } = useGroupsSearch();

  const sortOptions: Record<string, SortT> = useMemo(() => {
    return GROUPS_SORT_OPTIONS.reduce<Record<string, SortT>>(
      (items, { field, direction, displayName }) => {
        const id = field + direction;
        items[id] = {
          id,
          label: displayName,
          field,
          direction,
          displayName,
        };
        return items;
      },
      {}
    );
  }, []);

  return (
    <Selection
      items={Object.values(sortOptions)}
      menuSize="small"
      value={field + direction}
      noBorder
      selectProps={{
        renderValue(value: unknown) {
          const { displayName } = sortOptions[value as string];
          return `Sort by: ${displayName}`;
        },
        sx: {
          minWidth: 150,
          color: (theme) => theme.palette.text.secondary,
        },
        MenuProps: {
          anchorOrigin: { horizontal: 75, vertical: "bottom" },
        },
      }}
      onChange={(id) => {
        setSort(sortOptions[id as string]);
      }}
    />
  );
}
