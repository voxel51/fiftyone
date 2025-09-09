import { LoadingSpinner } from "@fiftyone/components";
import { EntryKind } from "@fiftyone/state";
import { Typography } from "@mui/material";
import { atom, useAtomValue } from "jotai";
import React from "react";
import styled from "styled-components";
import Sidebar from "../../../Sidebar";
import Actions from "./Actions";
import GroupEntry from "./GroupEntry";
import ImportSchema from "./ImportSchema";
import LabelEntry from "./LabelEntry";
import LoadingEntry from "./LoadingEntry";
import SchemaManager from "./SchemaManager";
import { activePaths, schemas, showModal } from "./state";
import useEntries from "./useEntries";
import useLabels from "./useLabels";

const showImportPage = atom((get) => !get(activePaths).length);

const Container = styled.div`
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  flex-direction: column;
  overflow: auto;
`;

const Loading = () => {
  return (
    <Container>
      <LoadingSpinner />
      <Typography color="secondary" padding="1rem 0">
        Loading
      </Typography>
    </Container>
  );
};

const AnnotateSidebar = () => {
  useLabels();
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
            const { kind: _, ...props } = entry;
            return {
              children: <LabelEntry {...props} />,
              disabled: true,
            };
          }

          if (entry.kind === EntryKind.LOADING) {
            return {
              children: <LoadingEntry />,
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
  const loading = useAtomValue(schemas) === null;

  if (loading) {
    return <Loading />;
  }

  return (
    <>
      {showImport ? <ImportSchema /> : <AnnotateSidebar />}
      {showSchemaModal && <SchemaManager />}
    </>
  );
};

export default Annotate;
