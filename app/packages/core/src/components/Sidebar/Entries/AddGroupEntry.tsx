import * as fos from "@fiftyone/state";
import React, { useContext, useState } from "react";
import { useRecoilCallback } from "recoil";

import { getDatasetName, RouterContext } from "@fiftyone/state";
import { InputDiv } from "./utils";

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
            current.map(({ name }) => name),
            newGroup
          )
        ) {
          return;
        }
        const newGroups: fos.State.SidebarGroup[] = [
          ...current,
          { name: newGroup, paths: [] },
        ];

        const view = await snapshot.getPromise(fos.view);
        set(fos.sidebarGroupsDefinition(false), newGroups);
        fos.persistSidebarGroups({
          dataset: getDatasetName(context),
          stages: view,
          sidebarGroups: newGroups,
        });
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
