import { ToolbarAction } from "@fiftyone/actions";
import {
  gridSortBy,
  gridSortFields,
  queryPerformance,
  similarityParameters,
} from "@fiftyone/state";
import { useReverbState, useReverbValue } from "@fiftyone/reverb";
import { SORT_BY_INDEXED_FIELDS } from "@fiftyone/utilities";
import {
  ArrowDownWideNarrowIcon,
  ArrowUpNarrowWideIcon,
  Dropdown,
  DropdownAnchor,
  LaunchIcon,
  MenuCheckItem,
  MenuIconTextItem,
  MenuSectionTitle,
  MenuSeparator,
} from "@voxel51/voodo";

/** Orders the grid by a field, ascending or descending */
export default function Sort() {
  const fields = useReverbValue(gridSortFields);
  const [value, select] = useReverbState(gridSortBy);
  const similarity = useReverbValue(similarityParameters);
  const isQPEnabled = useReverbValue(queryPerformance);
  if (!fields.length || similarity) {
    return null;
  }

  const descending = Boolean(value?.descending);
  const setDescending = (next: boolean) =>
    select((current) => (current ? { ...current, descending: next } : current));

  return (
    <Dropdown
      portal
      anchor={DropdownAnchor.BottomEnd}
      trigger={
        <ToolbarAction
          aria-label={`Sort: ${value?.field ?? "Default"}`}
          data-cy="grid-sort"
          icon={descending ? ArrowDownWideNarrowIcon : ArrowUpNarrowWideIcon}
          label={value?.field ?? "Default"}
          menu
        />
      }
    >
      <MenuSectionTitle>Sort by</MenuSectionTitle>
      <MenuCheckItem checked={!value} onClick={() => select(null)}>
        Default
      </MenuCheckItem>
      {fields.map((field) => (
        <MenuCheckItem
          key={field}
          checked={value?.field === field}
          onClick={() =>
            select((current) => ({
              field,
              descending: Boolean(current?.descending),
            }))
          }
        >
          {field}
        </MenuCheckItem>
      ))}
      <MenuSeparator />
      <MenuSectionTitle>Order</MenuSectionTitle>
      <MenuCheckItem
        checked={Boolean(value) && !descending}
        disabled={!value}
        onClick={() => setDescending(false)}
      >
        Ascending
      </MenuCheckItem>
      <MenuCheckItem
        checked={descending}
        disabled={!value}
        onClick={() => setDescending(true)}
      >
        Descending
      </MenuCheckItem>
      {isQPEnabled && (
        <>
          <MenuSeparator />
          <MenuIconTextItem
            icon={<LaunchIcon size={14} />}
            text="Add additional fields"
            onClick={() =>
              window.open(SORT_BY_INDEXED_FIELDS, "_blank", "noopener")
            }
          />
        </>
      )}
    </Dropdown>
  );
}
