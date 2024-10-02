import React, {
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useSetRecoilState } from "recoil";
import Box from "@mui/joy/Box";
import { useTheme } from "@mui/material/styles";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";

import { TableSkeleton, SearchSuggestion } from "@fiftyone/teams-components";
import { datasetSearchTermState } from "@fiftyone/teams-state";
import TextField from "@mui/material/TextField";
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";

import { DatasetSearchFields } from "@fiftyone/teams-state/src/Datasets/__generated__/DatasetsListQuery.graphql";
import { IconButton } from "@mui/material";
import useDatasetsFilter from "@fiftyone/hooks/src/datasets/DatasetList/useFilters";

const SEARCH_INPUT_DEBOUNCE = 500; // ms

export default function Search() {
  const throttling = useRef(false);
  const theme = useTheme();
  const { searchTerm, setSearchTerm } = useDatasetsFilter();
  const [localSearchTerm, setLocalSearchTerm] = useState<string>(searchTerm);
  const setDatasetSearchTerm = useSetRecoilState<{
    fields: string[];
    term: string;
  } | null>(datasetSearchTermState);

  // TODO:MANI - bad hack to clear input on "Reset search" click
  useEffect(() => {
    if (!searchTerm) {
      setLocalSearchTerm("");
    }
  }, [searchTerm]);

  const handleChange = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      setLocalSearchTerm(e.target.value);

      if (throttling.current) {
        return;
      }

      throttling.current = true;
      setTimeout(() => {
        throttling.current = false;
        setSearchTerm(e.target.value);
      }, SEARCH_INPUT_DEBOUNCE);
    },
    [setSearchTerm, throttling]
  );

  // TODO:MANI useCallback or memo for keyPress
  return (
    <Box>
      <TextField
        size="small"
        onKeyDown={(ev) => {
          if (ev.key === "Enter") {
            ev.preventDefault();
            setDatasetSearchTerm(searchTerm);
          }
        }}
        label=""
        placeholder="Filter by name, tag, or media type"
        InputProps={{
          startAdornment: (
            <SearchOutlinedIcon color="secondary" sx={{ marginRight: 1 }} />
          ),
          endAdornment: localSearchTerm && (
            <IconButton>
              <CloseOutlinedIcon
                sx={{ fontSize: 20 }}
                onClick={() => {
                  setDatasetSearchTerm({
                    fields: ["name"],
                    term: "",
                  });
                  setLocalSearchTerm("");
                }}
              />
            </IconButton>
          ),
        }}
        value={localSearchTerm}
        onChange={handleChange}
        autoComplete="off"
        sx={{
          "&::placeholder": {
            textOverflow: "ellipsis !important",
            color: "blue",
          },
          width: 260,
        }}
      />
      <Suspense
        fallback={
          <Box
            sx={{
              position: "absolute",
              width: 260,
              background: theme.palette.background.default,
              border: `1px solid ${theme.palette.divider}`,
              padding: 1,
              zIndex: theme.zIndex.tooltip + 1,
            }}
          >
            <TableSkeleton rows={5} skeletonProps={{ height: 48 }} />
          </Box>
        }
      >
        <SearchSuggestion />
      </Suspense>
    </Box>
  );
}
