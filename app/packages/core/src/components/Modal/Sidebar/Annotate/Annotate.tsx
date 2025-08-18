import { EntryKind } from "@fiftyone/state";
import { atom, useAtomValue } from "jotai";
import React from "react";
import Sidebar from "../../../Sidebar";
import Actions from "./Actions";
import GroupEntry from "./GroupEntry";
import ImportSchema from "./ImportSchema";
import ObjectItem from "./ObjectEntry";
import SchemaManager from "./SchemaManager";
import { activePaths, showModal } from "./state";
import useEntries from "./useEntries";

const showImportPage = atom((get) => !get(activePaths).length);

const AnnotateSidebar = () => {
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

const Annotate = () => {
  const showSchemaModal = useAtomValue(showModal);
  const showImport = useAtomValue(showImportPage);

  return (
    <>
      {showImport ? <ImportSchema /> : <AnnotateSidebar />}
      {showSchemaModal && <SchemaManager />}
    </>
  );
};

export default Annotate;
