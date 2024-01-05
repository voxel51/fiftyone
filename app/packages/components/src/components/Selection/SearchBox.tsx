import React from "react";

import { useTheme } from "@fiftyone/components";
import { Close } from "@mui/icons-material";
import { CustomSearchBox, SearchInput } from "./styledComponents";

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
    text: { secondary },
  } = theme;
  return (
    <CustomSearchBox data-cy={`${id}-selection-search-container`}>
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
          e.preventDefault();
          e.stopPropagation();
          if (!disabled) {
            (e.target as HTMLInputElement).focus();
          }
        }}
      />
      {searchValue && (
        <Close
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setSearchTerm("");
            debouncedSearch("");
          }}
          fontSize="small"
          style={{
            cursor: "pointer",
            color: secondary,
            position: "absolute",
            right: "1rem",
            top: "1.75rem",
          }}
        />
      )}
    </CustomSearchBox>
  );
};
