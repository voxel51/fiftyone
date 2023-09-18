import { Tooltip, useTheme } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import { Settings, VisibilityOff } from "@mui/icons-material";
import FilterAltIcon from "@mui/icons-material/FilterAlt";
import VisibilityIcon from "@mui/icons-material/Visibility";
import { Box, Typography } from "@mui/material";
import React from "react";
import { useRecoilState, useResetRecoilState, useSetRecoilState } from "recoil";
import styled from "styled-components";
import { FilterInputDiv } from "./utils";

const Filter = ({ modal }: { modal: boolean }) => {
  const theme = useTheme();
  const [isFilterMode, setIsFilterMode] = useRecoilState(
    fos.isSidebarFilterMode
  );

  const setSchemaModal = useSetRecoilState(fos.settingsModal);
  const resetSelectedFieldStages = useResetRecoilState(
    fos.selectedFieldsStageState
  );

  const {
    resetTextFilter,
    resetExcludedPaths,
    affectedPathCount,
    mergedSchema,
    isFieldVisibilityActive,
  } = fos.useSchemaSettings();

  const { setSearchResults } = fos.useSearchSchemaFields(mergedSchema);

  const { setViewToFields: setSelectedFieldsStage } =
    fos.useSetSelectedFieldsStage();

  const Text = styled.div`
    font-size: 1rem;
  `;

  return (
    <FilterInputDiv modal={modal}>
      <Box alignItems={"center"} display="flex">
        {isFilterMode && !modal && (
          <Box display="flex" onClick={() => !modal && setIsFilterMode(false)}>
            <Tooltip
              text={!modal ? "Toggle to visibility mode" : null}
              placement="bottom-start"
            >
              <FilterAltIcon
                sx={{
                  color: theme.text.tertiary,
                  "&:hover": {
                    color: !modal ? theme.text.primary : theme.text.tertiary,
                  },
                  margin: "auto 0.25rem",
                  cursor: !modal ? "pointer" : "default",
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
        {!isFilterMode && !modal && (
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
      {!modal && (
        <Box display="flex" alignItems="center">
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
                  setSelectedFieldsStage(undefined);
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
          <Tooltip
            text="Change field visibility"
            placement="bottom-center"
            data-cy="field-visibility-toggle-tooltip"
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
      )}
    </FilterInputDiv>
  );
};

export default React.memo(Filter);
