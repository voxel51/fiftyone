import { textFilter, useSetView } from "@fiftyone/state";
import React, { useState } from "react";
import { useDebounce } from "react-use";
import { useRecoilState, useRecoilValue, useSetRecoilState } from "recoil";
import { InputDiv } from "./utils";
import * as schemaAtoms from "@fiftyone/state/src/recoil/schema";
import { Stage } from "@fiftyone/utilities";
import * as fos from "@fiftyone/state";
import { OpenInFull, Settings } from "@mui/icons-material";

const Filter = ({ modal }: { modal: boolean }) => {
  const [debouncedValue, setDebouncedValue] = useRecoilState(textFilter(modal));
  const [value, setValue] = useState(() => debouncedValue);
  const setSchemaModal = useSetRecoilState(fos.settingsModal);
  const setView = useSetView();
  const dataset = useRecoilValue(fos.dataset);
  const schemaSettings = schemaAtoms.buildSchema(dataset, true);

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
        onKeyDown={(e) => {
          // Note: this code will be moved into a modal soon but here so we can get some testing started
          if (e.key === "Enter") {
            if (value) {
              if (value.includes("=")) {
                // select fields by path and corresponding value equality
                const [path, val] = value.split("=");
                if (!val) return;
                const stageKwargs = [
                  ["field", path],
                  ["filter", { name: val }],
                  ["only_matches", true],
                ];
                const stageCls = "fiftyone.core.stages.FilterField";
                const stage = { _cls: stageCls, kwargs: stageKwargs } as Stage;
                setView([stage]);
              } else if (value && value in schemaSettings) {
                // select fields by path only
                const path = value;
                const stageKwargs = [
                  ["field_names", [path]],
                  ["_allow_missing", false],
                ];
                const stageCls = "fiftyone.core.stages.FilterField";
                const stage = { _cls: stageCls, kwargs: stageKwargs } as Stage;
                setView([stage]);
              }
            } else {
              setView([]);
            }
          }
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
