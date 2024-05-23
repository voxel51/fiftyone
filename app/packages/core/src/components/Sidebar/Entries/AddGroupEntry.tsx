import * as fos from "@fiftyone/state";
import { default as React, useState } from "react";
import { useRecoilCallback, useRecoilValue } from "recoil";

import { InputDiv } from "./utils";

const AddGroup = () => {
  const [value, setValue] = useState("");
  const isFieldVisibilityApplied = useRecoilValue(fos.isFieldVisibilityActive);
  const canModifySidebarGroup = useRecoilValue(fos.canModifySidebarGroup);
  const disabled = canModifySidebarGroup.enabled !== true;

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
          subscription: await snapshot.getPromise(fos.stateSubscription),
          dataset: (await snapshot.getPromise(fos.datasetName)) as string,
          stages: view,
          sidebarGroups: newGroups,
        });
      },
    []
  );

  if (isFieldVisibilityApplied || disabled) {
    return null;
  }

  return (
    <InputDiv style={{ margin: 0 }}>
      <input
        data-cy="sidebar-field-add-group-input"
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
