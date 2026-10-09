import { Selection, type DatasetViewOption } from "@fiftyone/components";
import { AddIcon, Box, LastOption, TextContainer } from "./styledComponents";

export interface SavedViewsSelectionProps {
  /** View options to list, already filtered by the search term. */
  items: DatasetViewOption[];
  selected: DatasetViewOption | null;
  onSelect: (item: DatasetViewOption) => void;
  onClear: () => void;
  onEdit: (item: DatasetViewOption) => void;
  /** Opens the create-view dialog from the pinned last option. */
  onCreate: () => void;
  search: { value: string; onSearch: (term: string) => void };
  /** The viewer may not create or edit saved views. */
  disabled: boolean;
  /** Tooltip explaining ``disabled``. */
  disabledMsg?: string;
  /** There is nothing to save — the create option stays inert. */
  isEmptyView: boolean;
}

/**
 * The saved-views dropdown itself: the ``Selection`` list plus its pinned
 * "Save current filters as view" option.
 *
 * Split out of ``ViewSelection`` so the surrounding component keeps only
 * data-loading and URL/selection syncing, and so a caller can wrap the
 * control without re-indenting it.
 */
export default function SavedViewsSelection({
  items,
  selected,
  onSelect,
  onClear,
  onEdit,
  onCreate,
  search,
  disabled,
  disabledMsg,
  isEmptyView,
}: SavedViewsSelectionProps) {
  const createDisabled = isEmptyView || disabled;

  return (
    <Selection
      readonly={disabled}
      id="saved-views"
      selected={selected}
      setSelected={onSelect}
      onClear={onClear}
      items={items}
      onEdit={onEdit}
      search={{
        value: search.value,
        placeholder: "Search views...",
        onSearch: search.onSearch,
      }}
      lastFixedOption={
        <LastOption
          data-cy={"saved-views-create-new"}
          onClick={() => !createDisabled && onCreate()}
          disabled={createDisabled}
          title={disabledMsg}
        >
          <Box style={{ width: "12%" }}>
            <AddIcon fontSize="small" disabled={createDisabled} />
          </Box>
          <TextContainer disabled={createDisabled}>
            Save current filters as view
          </TextContainer>
        </LastOption>
      }
    />
  );
}
