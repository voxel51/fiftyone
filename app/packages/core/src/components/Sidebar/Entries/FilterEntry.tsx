import { useTheme } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import { FilterList, Settings, VisibilityOff } from "@mui/icons-material";
import VisibilityIcon from "@mui/icons-material/Visibility";
import { Box, Typography } from "@mui/material";
import { Anchor, Text as TooltipText, Tooltip } from "@voxel51/voodo";
import React from "react";
import {
  useRecoilState,
  useRecoilValue,
  useResetRecoilState,
  useSetRecoilState,
} from "recoil";
import styled from "styled-components";
import QueryPerformanceIcon from "./QueryPerformanceIcon";
import { FilterInputDiv } from "./utils";

const Text = styled.div`
  font-size: 1rem;
  color: ${({ theme }) => theme.text.secondary};
`;

const Filter = () => {
  const theme = useTheme();
  const [isFilterMode, setIsFilterMode] = useRecoilState(
    fos.isSidebarFilterMode,
  );

  const setSchemaModal = useSetRecoilState(fos.settingsModal);
  const resetSelectedFieldStages = useResetRecoilState(
    fos.fieldVisibilityStage,
  );

  const {
    resetTextFilter,
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
              anchor={Anchor.Bottom}
              content="Toggle to visibility mode"
              style={{ display: "flex" }}
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
              anchor={Anchor.Bottom}
              content={
                <TooltipText data-cy="sidebar-mode-tooltip-filter">
                  Use the controls below to create filtered views into your data
                </TooltipText>
              }
            >
              <Text data-cy="sidebar-mode-status">FILTER</Text>
            </Tooltip>
          </Box>
        )}
        {!isFilterMode && (
          <Box display="flex" onClick={() => setIsFilterMode(true)}>
            <Tooltip
              anchor={Anchor.Bottom}
              content="Toggle to filter mode"
              style={{ display: "flex" }}
            >
              <VisibilityIcon
                sx={{
                  color: theme.text.tertiary,
                  "&:hover": { color: theme.text.primary },
                  margin: "auto 0.25rem",
                }}
              />
            </Tooltip>
            <Tooltip
              anchor={Anchor.Bottom}
              content={
                <TooltipText data-cy="sidebar-mode-tooltip-visibility">
                  Use the controls below to toggle the visibility of field
                  values in the grid
                </TooltipText>
              }
            >
              <Text data-cy="sidebar-mode-status">VISIBILITY</Text>
            </Tooltip>
          </Box>
        )}
      </Box>

      <Box display="flex" alignItems="center" gap="4px">
        {isFieldVisibilityActive && (
          <Tooltip anchor={Anchor.Bottom} content="Clear field selection">
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
        <Tooltip
          anchor={Anchor.Bottom}
          content="Change field visibility"
          style={{ display: "flex" }}
        >
          <Settings
            data-cy="field-visibility-icon"
            onClick={() => {
              setSchemaModal({
                open: true,
              });
              resetTextFilter();
            }}
            sx={{
              color: theme.text.tertiary,
              "&:hover": { color: theme.text.primary },
            }}
          />
        </Tooltip>
      </Box>
    </FilterInputDiv>
  );
};

export default React.memo(Filter);
