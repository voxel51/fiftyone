import { textFilter } from "@fiftyone/state";
import React, { useState } from "react";
import { useDebounce } from "react-use";
import {
  useRecoilState,
  useRecoilValue,
  useResetRecoilState,
  useSetRecoilState,
} from "recoil";
import { InputDiv } from "./utils";
import * as fos from "@fiftyone/state";
import { Settings, VisibilityOff } from "@mui/icons-material";
import { Box, Typography } from "@mui/material";
import { selectedFieldsStageState } from "@fiftyone/state/src/hooks/useSchemaSettings";
import { Tooltip, useTheme } from "@fiftyone/components";

const Filter = ({ modal }: { modal: boolean }) => {
  const theme = useTheme();
  const [debouncedValue, setDebouncedValue] = useRecoilState(textFilter(modal));
  const [value, setValue] = useState(() => debouncedValue);
  const setSchemaModal = useSetRecoilState(fos.settingsModal);
  const selectedFieldsStage = useRecoilValue(selectedFieldsStageState);
  const resetSelectedFieldStages = useResetRecoilState(
    selectedFieldsStageState
  );

  const {
    setSelectedFieldsStage,
    resetTextFilter,
    resetExcludedPaths,
    affectedPathCount,
    setSearchResults,
  } = fos.useSchemaSettings();

  useDebounce(
    () => {
      setDebouncedValue(value);
    },
    200,
    [value]
  );

  return (
    <InputDiv>
      <input
        type={"text"}
        placeholder={"FILTER"}
        value={value}
        maxLength={140}
        onChange={({ target }) => {
          setValue(target.value);
        }}
        style={{ textTransform: "unset" }}
      />
      {!modal && (
        <Box display="flex" alignItems="center">
          {selectedFieldsStage && affectedPathCount > 0 && (
            <Tooltip text="Clear field selection" placement="bottom-center">
              <Box
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
          <Tooltip text="Change field visibility" placement="bottom-center">
            <Settings
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
    </InputDiv>
  );
};

export default React.memo(Filter);
