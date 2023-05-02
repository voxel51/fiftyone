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
import { ClearAll, Settings } from "@mui/icons-material";
import { Box } from "@mui/material";
import {
  revertSelectedPathsState,
  selectedFieldsStageState,
} from "@fiftyone/state/src/hooks/useSchemaSettings";
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
  const [revertSelectedPaths, setRevertSelectedPaths] = useRecoilState(
    revertSelectedPathsState
  );

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
      <Box display="flex" alignItems="center">
        {selectedFieldsStage && (
          <Tooltip
            text="Clear schema field selection"
            placement="bottom-center"
          >
            <ClearAll
              onClick={() => {
                resetSelectedFieldStages();
                setRevertSelectedPaths(!revertSelectedPaths);
              }}
              sx={{
                color: theme.text.primary,
                background: theme.voxel[500],
                borderRadius: "50%",
              }}
            />
          </Tooltip>
        )}
        <Settings
          onClick={() =>
            setSchemaModal({
              open: true,
            })
          }
          sx={{ color: theme.text.secondary }}
        />
      </Box>
    </InputDiv>
  );
};

export default React.memo(Filter);
