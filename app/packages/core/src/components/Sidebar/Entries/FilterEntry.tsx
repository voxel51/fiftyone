import { textFilter } from "@fiftyone/state";
import React, { useState } from "react";
import { useDebounce } from "react-use";
import { useRecoilState, useSetRecoilState } from "recoil";
import { InputDiv } from "./utils";
import * as fos from "@fiftyone/state";
import { Settings } from "@mui/icons-material";

const Filter = ({ modal }: { modal: boolean }) => {
  const [debouncedValue, setDebouncedValue] = useRecoilState(textFilter(modal));
  const [value, setValue] = useState(() => debouncedValue);
  const setSchemaModal = useSetRecoilState(fos.settingsModal);

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
      <Settings
        onClick={() =>
          setSchemaModal({
            open: true,
          })
        }
      />
    </InputDiv>
  );
};

export default React.memo(Filter);
