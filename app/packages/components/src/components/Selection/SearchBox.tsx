import React from "react";

import styled from "styled-components";

import { useTheme } from "@fiftyone/components";
import { Close } from "@mui/icons-material";

const Box = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
`;

const SearchInput = styled.input`
  width: 100%;
  margin: 0.5rem 0.75rem;
  border-radius: 4px;
  cursor: ${({ disabled }) =>
    disabled ? "not-allowed" : "pointer"} !important;
  padding: 0.25rem 0.5rem;
  color: ${({ theme }) => theme.text.primary};
  background: ${({ theme }) => theme.background.level3};
  border: 1px solid ${({ theme }) => theme.primary.plainBorder};

  &:focus {
    border: 1px solid ${({ theme }) => theme.primary.softBorder};
    outline: none;
  }
`;

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
    background: { level1 },
    primary: { plainBorder },
    text: { secondary },
  } = theme;
  return (
    <Box
      data-cy={`${id}-selection-search-container`}
      style={{
        position: "sticky",
        top: 0,
        zIndex: 9999,
        background: level1,
        borderBottom: `1px solid ${plainBorder}`,
      }}
    >
      <SearchInput
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
    </Box>
  );
};
