import React from "react";
import { GroupView } from "../../GroupView";
import { GroupElementsLinkBar } from "./GroupElementsLinkBar";

export const NestedGroup = () => {
  return <GroupView subBar={<GroupElementsLinkBar />} />;
};
