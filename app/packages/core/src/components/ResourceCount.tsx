import * as fos from "@fiftyone/state";
import {
  isGroup as isGroupAtom,
  parentMediaTypeSelector,
} from "@fiftyone/state";
import React from "react";
import { useRecoilValue, useRecoilValueLoadable } from "recoil";
import styled from "styled-components";
import TimedOut from "./Common/TimedOut";
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
  const queryPerformance = useRecoilValue(fos.queryPerformance);
  const result = useRecoilValueLoadable(
    fos.count({ path: "_", extended: true, modal: false })
  );

  if (
    result.state === "hasError" &&
    result.contents instanceof fos.AggregationQueryTimeout
  ) {
    return <TimedOut queryTime={result.contents.queryTime} />;
  }

  return groupStats === "group" && !queryPerformance ? (
    <GroupsCount />
  ) : (
    <Count />
  );
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
        (<PathEntryCounts modal={false} path={""} />{" "}
        {elementTotal === 1 ? element.singular : element.plural}){" "}
        <PathEntryCounts modal={false} path={"_"} />{" "}
        {total === 1 ? "group" : "groups"}
        {groupSlice && " with slice"}
      </div>
    </RightDiv>
  );
};

const Count = () => {
  let element = useRecoilValue(fos.elementNames);
  const isDynamicGroupViewStageActive = useRecoilValue(fos.isDynamicGroup);
  let total = useRecoilValue(
    fos.count({ path: "", extended: false, modal: false })
  );
  const subtotal = useRecoilValue(
    fos.count({ path: "", extended: true, modal: false })
  );

  const parent = useRecoilValue(parentMediaTypeSelector);
  const slice = useRecoilValue(fos.groupSlice);

  const isGroup = useRecoilValue(isGroupAtom);
  const queryPerformance = useRecoilValue(fos.queryPerformance);
  if (queryPerformance) {
    total = subtotal;
  }
  if (
    !queryPerformance &&
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
        <PathEntryCounts modal={false} path={""} />{" "}
        {isDynamicGroupViewStageActive &&
          !["sample", "group"].includes(element.singular) &&
          `group${total === 1 ? "" : "s"} of `}
        {total === 1 ? element.singular : element.plural}
        {!queryPerformance && slice && " with slice"}
      </div>
    </RightDiv>
  );
};

export default ResourceCount;
