import React, { useState } from "react";
import { useRecoilState, useRecoilValue } from "recoil";

import { sidebarEntries, sidebarGroupNames } from "../recoil";
import { EntryKind, validateGroupName } from "../utils";
import { InputDiv } from "./utils";

const AddGroup = () => {
  const [entries, setEntries] = useRecoilState(
    sidebarEntries({ modal: false, loadingTags: true })
  );
  const [value, setValue] = useState("");
  const currentGroups = useRecoilValue(sidebarGroupNames(false));

  return (
    <InputDiv>
      <input
        type={"text"}
        placeholder={"+ add group"}
        value={value}
        maxLength={140}
        onChange={(e) => setValue(e.target.value.toLocaleLowerCase())}
        onKeyDown={(e) => {
          if (e.key === "Enter" && value.length) {
            if (!validateGroupName(value)) {
              return;
            }

            if (!currentGroups.includes(value)) {
              const newEntries = [...entries];
              newEntries.splice(entries.length - 1, 0, {
                kind: EntryKind.GROUP,
                name: value,
              });

              setEntries(newEntries);
              setValue("");
            } else {
              alert(`${value.toUpperCase()} is already a group name`);
            }
          }
        }}
      />
    </InputDiv>
  );
};

export default React.memo(AddGroup);
