import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import Box from "@mui/joy/Box";
import { useCallback } from "react";
import { useRecoilState, useResetRecoilState, useSetRecoilState } from "recoil";

import { useSearchAdornment } from "@fiftyone/hooks";
import {
  CONSTANT_VARIABLES,
  groupSearchInputState,
  groupSearchTermState,
} from "@fiftyone/teams-state";
import { Close } from "@mui/icons-material";
import { Chip, IconButton } from "@mui/material";
import TextField from "@mui/material/TextField";
import { cloneDeep, throttle } from "lodash";

const { SEARCH_INPUT_DEBOUNCE } = CONSTANT_VARIABLES;

export default function SearchBar() {
  const setGroupSearchTerm = useSetRecoilState(groupSearchTermState);
  const resetGroupSearchTerm = useResetRecoilState(groupSearchTermState);
  const resetSearch = useResetRecoilState(groupSearchInputState);

  const [searchInput, setSearchInput] = useRecoilState(groupSearchInputState);
  const setInputRecoil = useCallback(
    throttle(setSearchInput, SEARCH_INPUT_DEBOUNCE),
    []
  );
  const prefixes = ["name:"];
  const { typeAdornment, displayWithoutAdornment } = useSearchAdornment(
    prefixes,
    searchInput
  );

  const handleDeleteTypeAdornment = () => {
    setSearchInput(displayWithoutAdornment);
    setInputRecoil(displayWithoutAdornment);
  };

  return (
    <TextField
      size="small"
      sx={{ minWidth: "300px" }}
      InputProps={{
        autoFocus: true,
        startAdornment: (
          <Box display="flex" alignItems="center">
            <SearchOutlinedIcon color="secondary" sx={{ mr: 1 }} />
            {typeAdornment && <Chip size="small" label={typeAdornment} />}
          </Box>
        ),
        endAdornment: (
          <Box display="flex">
            <IconButton
              onClick={() => {
                resetSearch();
                resetGroupSearchTerm();
              }}
            >
              <Close
                sx={{
                  fontSize: 16,
                  color: (theme) => theme.palette.text.secondary,
                  borderRadius: "50%",
                  ":hover": {
                    cursor: "pointer",
                  },
                }}
              />
            </IconButton>
          </Box>
        ),
      }}
      placeholder="Ex: name, name: foo"
      value={typeAdornment ? cloneDeep(displayWithoutAdornment) : searchInput}
      onChange={(e) => {
        e.preventDefault();
        const adjustedValue = typeAdornment
          ? [typeAdornment, e.target.value].join(":")
          : e.target.value;

        setSearchInput(adjustedValue);
        setInputRecoil(adjustedValue);
      }}
      onKeyDown={(ev) => {
        if (ev.key === "Enter") {
          ev.preventDefault();
          const searchOptions = {
            fields: ["name"],
            term: searchInput,
          };
          setGroupSearchTerm(searchOptions);
        }
        if (ev.key === "Backspace") {
          if (searchInput === `${typeAdornment}:`) {
            handleDeleteTypeAdornment();
          }
        }
      }}
    />
  );
}
