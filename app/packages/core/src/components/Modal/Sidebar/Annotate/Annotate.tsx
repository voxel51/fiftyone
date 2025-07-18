import { EntryKind } from "@fiftyone/state";
import React from "react";
import Sidebar from "../../../Sidebar";
import Actions from "./Actions";
import GroupEntry from "./GroupEntry";
import ObjectItem from "./ObjectEntry";
import useEntries from "./useEntries";

const Annotate = () => {
  return (
    <>
      <Actions />
      <Sidebar
        isDisabled={() => true}
        render={(key, group, entry) => {
          if (entry.kind === EntryKind.GROUP) {
            return { children: <GroupEntry name={entry.name} /> };
          }

          if (entry.kind === EntryKind.LABEL) {
            return {
              children: <ObjectItem />,
              disabled: true,
            };
          }

          throw new Error("unexpected");
        }}
        useEntries={useEntries}
      />
    </>
  );
};

export default Annotate;
