import React from "react";

import styled from "styled-components";

import { useTheme } from "@fiftyone/components";
import { Close } from "@mui/icons-material";
import { CustomBox, SearchInput } from "./styledComponents";

export const SearchBox = ({
  id,
  searchTerm,
  searchPlaceholder,
  setSearchTerm,
  debouncedSearch,
  searchValue,
  disabled = false,
}: {
  id: string;
  searchTerm: string;
  searchPlaceholder?: string;
  setSearchTerm: (term: string) => void;
  debouncedSearch: (term: string) => void;
  searchValue?: string;
  disabled?: boolean;
}) => {
  const theme = useTheme();
  const {
    background: { level3 },
    primary: { plainBorder },
    text: { secondary },
  } = theme;
  return (
    <CustomBox
      data-cy={`${id}-selection-search-container`}
      sx={{
        position: "sticky",
        top: 0,
        zIndex: 9999,
        background: level3,
        borderBottom: `1px solid ${plainBorder}`,
      }}
    >
      <SearchInput
        autoFocus
        data-cy={`${id}-selection-search-input`}
        disabled={disabled}
        value={searchTerm}
        placeholder={searchPlaceholder}
        onChange={(e) => {
          const val: string = e.target.value;
          setSearchTerm(val);
          debouncedSearch(val);
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
        }}
        onKeyUp={(e) => {
          e.stopPropagation();
        }}
        onClick={(e) => {
          if (!disabled) {
            (e.target as HTMLInputElement).focus();
          }
        }}
      />
      {searchValue && (
        <Close
          onClick={() => {
            setSearchTerm("");
            debouncedSearch("");
          }}
          fontSize="small"
          style={{
            cursor: "pointer",
            color: secondary,
            position: "absolute",
            right: 20,
          }}
        />
      )}
    </CustomBox>
  );
};
