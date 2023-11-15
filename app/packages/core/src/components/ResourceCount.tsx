import * as fos from "@fiftyone/state";
import {
  isGroup as isGroupAtom,
  parentMediaTypeSelector,
} from "@fiftyone/state";
import React from "react";
import { useRecoilValue } from "recoil";
import styled from "styled-components";
import { PathEntryCounts } from "./Sidebar/Entries/EntryCounts";

const RightDiv = styled.div`
  display: flex;
  justify-content: center;
  align-content: center;
  flex-direction: column;
  border-color: ${({ theme }) => theme.primary.plainBorder};
  border-right-style: solid;
  border-right-width: 1px;
  margin: 0 0.25rem;
  padding-right: 1rem;
  font-weight: bold;
  white-space: nowrap;
`;

const ResourceCount = () => {
  const groupStats = useRecoilValue(fos.groupStatistics(false));
  const lightning = useRecoilValue(fos.lightning);
  return groupStats === "group" && !lightning ? <GroupsCount /> : <Count />;
};

const GroupsCount = () => {
  const element = useRecoilValue(fos.elementNames);
  const elementTotal = useRecoilValue(
    fos.count({ path: "", extended: false, modal: false })
  );
  const groupSlice = useRecoilValue(fos.groupSlice);
  const total = useRecoilValue(
    fos.count({ path: "_", extended: false, modal: false })
  );

  return (
    <RightDiv data-cy="entry-counts">
      <div>
        (<PathEntryCounts modal={false} path={""} />
        {` `}
        {elementTotal === 1 ? element.singular : element.plural}){` `}
        <PathEntryCounts modal={false} path={"_"} ignoreSidebarMode />
        {` `}
        {total === 1 ? "group" : "groups"}
        {groupSlice && ` with slice`}
      </div>
    </RightDiv>
  );
};

const Count = () => {
  let element = useRecoilValue(fos.elementNames);
  const isDynamicGroupViewStageActive = useRecoilValue(fos.isDynamicGroup);
  const total = useRecoilValue(
    fos.count({ path: "", extended: false, modal: false })
  );

  const parent = useRecoilValue(parentMediaTypeSelector);
  const slice = useRecoilValue(fos.groupSlice);

  const isGroup = useRecoilValue(isGroupAtom);
  const lightning = useRecoilValue(fos.lightning);
  if (
    !lightning &&
    ((isGroup && !isDynamicGroupViewStageActive) ||
      (isDynamicGroupViewStageActive && parent === "group") ||
      (isDynamicGroupViewStageActive && element.singular === "sample"))
  ) {
    element = {
      plural: "groups",
      singular: "group",
    };
  }

  return (
    <RightDiv data-cy="entry-counts">
      <div style={{ whiteSpace: "nowrap" }}>
        <PathEntryCounts modal={false} path={""} />
        {` `}
        {isDynamicGroupViewStageActive &&
          !["sample", "group"].includes(element.singular) &&
          `group${total === 1 ? "" : "s"} of `}
        {total === 1 ? element.singular : element.plural}
        {!lightning && slice && ` with slice`}
      </div>
    </RightDiv>
  );
};

export default ResourceCount;
