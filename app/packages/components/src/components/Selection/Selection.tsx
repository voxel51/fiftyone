import { IconButton, useTheme, ColoredDot } from "@fiftyone/components";
import { DEFAULT_SELECTED } from "@fiftyone/state";
import { CloseRounded } from "@mui/icons-material";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import { Select, Typography } from "@mui/material";
import { debounce } from "lodash";
import React, { useCallback, useState } from "react";
import SelectionOption, { DatasetViewOption } from "./Option";
import { SearchBox } from "./SearchBox";
import { DEFAULT_COLOR_OPTION } from "./SelectionColors";
import { CustomBox, LastOption, ViewContainer } from "./styledComponents";

type SelectionProps = {
  id: string;
  items: Array<DatasetViewOption>;
  headerComponent?: React.ReactNode;
  search?: {
    placeholder: string;
    onSearch: (term: string) => void;
    value: string;
  };
  selected: DatasetViewOption | null;
  setSelected: (item: DatasetViewOption) => void;
  lastFixedOption?: React.ReactNode;
  onChange?: (item: string) => void;
  value?: string;
  disabled?: boolean;
  hideActions?: boolean;
  readonly?: boolean; // no edits available
  onEdit?: (item: DatasetViewOption) => void;
  onClear?: () => void;
  noBorder?: boolean;
  insideModal?: boolean; // elevate z-index when inside a modal/dialog
};

/**
 * Renders a selectable dropdown for dataset views with optional search, edit, and clear actions.
 *
 * Displays the currently selected view with its color dot and label, presents a list of provided
 * items to choose from, and optionally shows a search box, header area, and a fixed action at the
 * bottom. If `selected` is null the component returns null.
 *
 * @param props - Component props controlling items, selection, appearance, and behavior. Notable props:
 *   - `items`: list of view options shown in the dropdown.
 *   - `selected` / `setSelected`: current selection and updater invoked when an item is chosen.
 *   - `search`: when provided, renders a search box and calls `search.onSearch` with a debounced,
 *     lowercased term.
 *   - `hideActions`: hides edit/clear actions in list items when true.
 *   - `readonly` / `onEdit` / `onClear`: control edit and clear actions exposed in the UI.
 *   - `lastFixedOption`: node rendered persistently at the bottom of the menu.
 *   - `insideModal`: when true, raises the dropdown's z-index so it overlays modal/dialog layers.
 *
 * @returns The JSX element for the selection dropdown, or `null` if `selected` is not provided.
 */
export default function Selection(props: SelectionProps) {
  const {
    id,
    items = [],
    headerComponent = null,
    lastFixedOption = null,
    search,
    selected,
    setSelected,
    hideActions,
    readonly,
    onEdit,
    onClear,
    noBorder,
    insideModal = false,
  } = props;

  const theme = useTheme();
  const [isOpen, setIsOpen] = useState<boolean>(false);

  const {
    placeholder: searchPlaceholder,
    onSearch,
    value: searchValue,
  } = search || {};

  const [searchTerm, setSearchTerm] = useState<string>(searchValue || "");
  const { id: selectedId, color: selectedColor } = selected || {};

  const debouncedSearch = useCallback(
    debounce((term: string) => {
      onSearch?.(term?.toLowerCase());
    }, 300),
    [onSearch]
  );

  if (!selected) {
    return null;
  }

  const selectionId = id;

  return (
    <div style={{ width: "100%" }} data-cy={`${id}-selection-container`}>
      <Select
        MenuProps={{
          sx: {
            // default dialog z-index is 1300
            zIndex: insideModal ? 2400 : undefined,
          },
          MenuListProps: {
            sx: {
              paddingY: 0,
            },
          },
        }}
        IconComponent={
          selectedId === DEFAULT_SELECTED.id || hideActions
            ? ArrowDropDownIcon
            : () => (
                <IconButton
                  data-cy={`${id}-btn-selection-clear`}
                  size="small"
                  sx={{
                    "&:hover": {
                      background: theme.background.level1,
                    },
                    mr: 1,
                  }}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsOpen(false);
                    onClear?.();
                  }}
                >
                  <CloseRounded />
                </IconButton>
              )
        }
        size="small"
        data-cy={`${id}-selection`}
        value={selectedId}
        defaultValue={selectedId}
        sx={{
          width: "100%",
          background: theme.background.level3,
          ...(noBorder
            ? {
                "& fieldset": {
                  border: "none",
                },
              }
            : {}),
        }}
        renderValue={() => {
          return (
            <CustomBox justifyContent="start">
              <ColoredDot
                color={selectedColor || DEFAULT_COLOR_OPTION.color}
                data-cy="selection-color-dot"
              />
              <Typography>{selected.label}</Typography>
            </CustomBox>
          );
        }}
        open={isOpen}
        onClick={() => {
          setIsOpen(!isOpen);
        }}
      >
        {onSearch && (
          <SearchBox
            id="saved-views"
            debouncedSearch={debouncedSearch}
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            searchPlaceholder={searchPlaceholder}
            searchValue={searchValue}
          />
        )}
        {!onSearch && headerComponent}

        <ViewContainer
          data-cy="selection-view"
          width={hideActions ? "100%" : "270px"}
        >
          {items.map((itemProps) => {
            const { id, color, label, slug } = itemProps;
            return (
              <SelectionOption
                dataCy={`${selectionId}-${slug || "new"}-selection-option`}
                key={id || label}
                item={itemProps}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsOpen(false);
                  setSelected(itemProps);
                }}
                isSelected={id === selectedId}
                preDecorator={
                  <CustomBox
                    style={{
                      width: "1.5rem",
                      display: "inline-block",
                    }}
                  >
                    <ColoredDot color={color || DEFAULT_COLOR_OPTION.color} />
                  </CustomBox>
                }
                readonly={readonly}
                onEdit={onEdit}
                hideActions={hideActions}
              />
            );
          })}
        </ViewContainer>
        {lastFixedOption && (
          <LastOption
            key="create-view-option"
            value="create-view-option"
            label=""
            onClick={(e) => {
              e.preventDefault();
            }}
          >
            {lastFixedOption}
          </LastOption>
        )}
      </Select>
    </div>
  );
}