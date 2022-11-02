import React, { useCallback, useMemo, useRef, useState } from "react";

import { Option, Select } from "@mui/joy";
import styled from "styled-components";

import { useOutsideClick } from "@fiftyone/state";
import SelectionOption from "./Option";
import { useTheme } from "@fiftyone/components";
import { SelectionItemProps } from "./Option";
import { debounce } from "lodash";
import { SearchBox } from "./SearchBox";

const Box = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
`;
const LastOption = styled(Option)`
  border-top: 1px solid ${({ theme }) => theme.primary.plainBorder} !important;
  position: sticky !important;
  bottom: 0;
  width: 100%;
  background: ${({ theme }) => theme.background.level2} !important;
  z-index: 999;
  display: flex;

  &:hover: {
    background: ${({ theme }) => theme.background.level3};
  }
`;
const ColoredDot = styled(Box)`
  background: ${(props) => props.color};
  width: 10px;
  height: 10px;
  border-radius: 50%;
  margin-right: 0.5rem;
  margin-left: 0.25rem;
`;

type SelectionProps = {
  items: Array<SelectionItemProps>;
  headerComponent?: React.ReactNode;
  search?: {
    placeholder: string;
    onSearch: (term: string) => void;
    value: string;
  };
  selected: SelectionItemProps;
  setSelected: (item: SelectionItemProps) => void;
  lastFixedOption?: React.ReactNode;
  onChange?: (item: string) => void;
  value?: string;
  disabled?: boolean; // TODO: MANI - add permissions
  compact?: boolean; // compact form rows
  readonly?: boolean; // no edits
};

const VIEW_LIST_MAX_HEIGHT = "300px";

const VIEW_COLORS = {
  Blue: "#2970FF",
  Cyan: "#06AED4",
  Green: "#16B364",
  Yellow: "#FAC515",
  Orange: "#EF6820",
  Red: "#F04438",
  Pink: "#EE46BC",
  Purple: "#7A5AF8",
  Gray: "#667085",
};

export default function Selection(props: SelectionProps) {
  const {
    items = [],
    headerComponent = null,
    lastFixedOption = null,
    search,
    selected,
    setSelected,
    compact,
    readonly,
  } = props;
  const theme = useTheme();
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const ref = useRef();
  useOutsideClick(ref, () => setIsOpen(false));

  const {
    placeholder: searchPlaceholder,
    onSearch,
    value: searchValue,
  } = search || {};
  const [searchTerm, setSearchTerm] = useState<string>(searchValue || "");

  const { id: selectedId, color: selectedColor } = selected;
  const textBoxStyle = useMemo(
    () => ({
      overflow: "hidden",
      whiteSpace: "nowrap",
      textOverflow: "ellipsis",
      width: "100%",
      display: "inline-block",
      background: theme.background.level1,
    }),
    []
  );

  const debouncedSearch = useCallback(
    debounce((term: string) => {
      onSearch?.(term?.toLowerCase());
    }, 300),
    [onSearch]
  );

  return (
    <div ref={ref} style={{ width: "100%" }}>
      <Select
        value={selectedId}
        listboxOpen={isOpen}
        componentsProps={{
          listbox: {
            sx: {
              "--List-decorator-size": "24px",
              padding: "0px",
              maxHeight: VIEW_LIST_MAX_HEIGHT,
              overflow: "scroll",
              background: theme.background.level1,
              "&:hover": {
                background: theme.background.level1,
              },
            },
          },
          root: {
            sx: {
              ...textBoxStyle,
              display: "flex",
              padding: "0 1rem",
              background: theme.background.level1,
              "&:hover": {
                background: theme.background.level1,
              },
            },
          },
          button: {
            sx: {
              ...textBoxStyle,
              textAlign: "left",
              background: theme.background.level1,

              "&:hover": {
                background: theme.background.level1,
              },
            },
          },
        }}
        startDecorator={<ColoredDot color={selectedColor} />}
        onClick={() => {
          setIsOpen(!isOpen);
        }}
      >
        {onSearch && (
          <SearchBox
            debouncedSearch={debouncedSearch}
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            searchPlaceholder={searchPlaceholder}
            searchValue={searchValue}
          />
        )}
        {!onSearch && headerComponent}
        <Box
          style={{
            flexDirection: "column",
            width: "100%",
          }}
        >
          {items.map((itemProps) => {
            const { id, color, label } = itemProps;
            return (
              <Option
                key={id}
                value={id}
                label={label}
                onClick={() => {
                  setSelected(itemProps);
                  setIsOpen(false);
                }}
                sx={{
                  display: "flex",
                  width: "100%",

                  ["&.JoyOption-highlighted"]: {
                    background: "unset",
                  },
                  ["&.Joy-selected"]: {
                    background: theme.background.body,
                    border: "none",
                  },
                }}
              >
                <SelectionOption
                  item={itemProps}
                  isSelected={id === selectedId}
                  preDecorator={
                    <Box
                      style={{
                        width: compact ? "6%" : "12%",
                        display: "inline-block",
                      }}
                    >
                      <ColoredDot color={color || VIEW_COLORS.Orange} />
                    </Box>
                  }
                  compact
                  readonly
                />
              </Option>
            );
          })}
        </Box>
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
