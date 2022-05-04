import React, { useState } from "react";
import { useRecoilCallback } from "recoil";

import { State } from "../../../recoil/types";
import * as viewAtoms from "../../../recoil/view";
import { getDatasetName } from "../../../utils/generic";

import { persistGroups, sidebarGroupsDefinition } from "../recoil";
import { validateGroupName } from "../utils";
import { InputDiv } from "./utils";

const AddGroup = () => {
  const [value, setValue] = useState("");
  const addGroup = useRecoilCallback(
    ({ set, snapshot }) => async (newGroup: string) => {
      const current = await snapshot.getPromise(sidebarGroupsDefinition(false));
      if (
        !validateGroupName(
          current.map(([name]) => name),
          newGroup
        )
      ) {
        return;
      }
      const newGroups: State.SidebarGroups = [...current, [newGroup, []]];

      const view = await snapshot.getPromise(viewAtoms.view);
      set(sidebarGroupsDefinition(false), newGroups);
      persistGroups(getDatasetName(), view, newGroups);
    },
    []
  );

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
            addGroup(e.target.value.toLowerCase());
            setValue("");
          }
        }}
      />
    </InputDiv>
  );
};

export default React.memo(AddGroup);
