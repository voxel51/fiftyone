import React, { useContext, useState } from "react";
import { useRecoilCallback } from "recoil";
import * as fos from "@fiftyone/state";

import { InputDiv } from "./utils";
import { RouterContext } from "@fiftyone/state";
import { getDatasetName } from "@fiftyone/state";

const AddGroup = () => {
  const [value, setValue] = useState("");
  const context = useContext(RouterContext);
  const addGroup = useRecoilCallback(
    ({ set, snapshot }) =>
      async (newGroup: string) => {
        const current = await snapshot.getPromise(
          fos.sidebarGroupsDefinition(false)
        );
        if (
          !fos.validateGroupName(
            current.map(([name]) => name),
            newGroup
          )
        ) {
          return;
        }
        const newGroups: fos.State.SidebarGroups = [...current, [newGroup, []]];

        const view = await snapshot.getPromise(fos.view);
        set(fos.sidebarGroupsDefinition(false), newGroups);
        fos.persistGroups(getDatasetName(context), view, newGroups);
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
