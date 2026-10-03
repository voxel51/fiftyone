import { Tooltip, useTheme } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import { FilterList, VisibilityOff } from "@mui/icons-material";
import VisibilityIcon from "@mui/icons-material/Visibility";
import { Box, Typography } from "@mui/material";
import React from "react";
import { useRecoilState, useRecoilValue, useResetRecoilState } from "recoil";
import styled from "styled-components";
import QueryPerformanceIcon from "./QueryPerformanceIcon";
import { FilterInputDiv } from "./utils";

const Text = styled.div`
  font-size: 1rem;
  color: ${({ theme }) => theme.text.secondary};
`;

/**
 * The sidebar's mode row: the Filter / Visibility toggle on the left,
 * the query-performance bolt on the right. Field visibility is owned
 * by persisted label schemas now (the schema row above, and the Schema
 * Manager), so the per-session Field Visibility modal and its gear are
 * gone from here.
 */
const Filter = (_props: { modal?: boolean }) => {
  const theme = useTheme();
  const [isFilterMode, setIsFilterMode] = useRecoilState(
    fos.isSidebarFilterMode,
  );

  const resetSelectedFieldStages = useResetRecoilState(
    fos.fieldVisibilityStage,
  );

  const {
    resetExcludedPaths,
    affectedPathCount,
    mergedSchema,
    isFieldVisibilityActive,
  } = fos.useSchemaSettings();

  const { setSearchResults } = fos.useSearchSchemaFields(mergedSchema);
  const queryPerformance = useRecoilValue(fos.queryPerformance);

  return (
    <FilterInputDiv>
      <Box alignItems="center" display="flex">
        {isFilterMode && (
          <Box display="flex" onClick={() => setIsFilterMode(false)}>
            <Tooltip
              text={"Toggle to visibility mode"}
              placement="bottom-start"
            >
              <FilterList
                sx={{
                  color: theme.text.tertiary,
                  "&:hover": {
                    color: theme.text.primary,
                  },
                  margin: "auto 0.25rem",
                  cursor: "pointer",
                }}
              />
            </Tooltip>
            <Tooltip
              text="Use the controls below to create filtered views into your data"
              placement="bottom-start"
            >
              <Text data-cy="sidebar-mode-status">FILTER</Text>
            </Tooltip>
          </Box>
        )}
        {!isFilterMode && (
          <Box display="flex" onClick={() => setIsFilterMode(true)}>
            <Tooltip text="Toggle to filter mode" placement="bottom-start">
              <VisibilityIcon
                sx={{
                  color: theme.text.tertiary,
                  "&:hover": { color: theme.text.primary },
                  margin: "auto 0.25rem",
                }}
              />
            </Tooltip>
            <Tooltip
              text="Use the controls below to toggle the visibility of field values in the grid"
              placement="bottom-start"
            >
              <Text data-cy="sidebar-mode-status">VISIBILITY</Text>
            </Tooltip>
          </Box>
        )}
      </Box>

      <Box display="flex" alignItems="center" gap="4px">
        {isFieldVisibilityActive && (
          <Tooltip text="Clear field selection" placement="bottom-center">
            <Box
              data-cy="field-visibility-btn-clear"
              sx={{
                minWidth: "50px",
                maxWidth: "100px",
                background: theme.background.level1,
                borderRadius: "25px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              onClick={() => {
                resetSelectedFieldStages();
                resetExcludedPaths();
                setSearchResults([]);
              }}
            >
              {affectedPathCount > 0 && (
                <Typography
                  fontSize={"0.75rem"}
                  sx={{ color: theme.text.tertiary }}
                  style={{ marginRight: "0.25rem" }}
                >
                  {affectedPathCount}
                </Typography>
              )}
              <VisibilityOff
                sx={{
                  color: theme.text.secondary,
                  borderRadius: "50%",
                  fontSize: "1.5rem",
                  marginRight: "0.25rem",
                  "&:hover": { color: theme.text.primary },
                }}
              />
            </Box>
          </Tooltip>
        )}
        {queryPerformance && <QueryPerformanceIcon />}
      </Box>
    </FilterInputDiv>
  );
};

export default React.memo(Filter);
