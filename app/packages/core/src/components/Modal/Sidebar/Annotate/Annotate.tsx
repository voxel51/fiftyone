import { LoadingSpinner } from "@fiftyone/components";
import { EntryKind } from "@fiftyone/state";
import { Typography } from "@mui/material";
import { atom, useAtomValue } from "jotai";
import React from "react";
import styled from "styled-components";
import Sidebar from "../../../Sidebar";
import Actions from "./Actions";
import Edit, { isEditing } from "./Edit";
import GroupEntry from "./GroupEntry";
import ImportSchema from "./ImportSchema";
import LabelEntry from "./LabelEntry";
import LoadingEntry from "./LoadingEntry";
import SchemaManager from "./SchemaManager";
import { activePaths, schemas, showModal } from "./state";
import type { AnnotationDisabledReason } from "./useCanAnnotate";
import useEntries from "./useEntries";
import useLabels from "./useLabels";

const showImportPage = atom((get) => !get(activePaths).length);

const DISABLED_MESSAGES: Record<
  Exclude<AnnotationDisabledReason, null>,
  React.ReactNode
> = {
  generatedView: (
    <p>
      Annotation isn&rsquo;t supported for patches, frames, clips, or
      materialized views.
    </p>
  ),
  groupedDataset: (
    <p>
      Annotation isn&rsquo;t supported for grouped datasets. Use{" "}
      <code>SelectGroupSlices</code> to create a view of the image or 3D slices
      you want to label.
    </p>
  ),
  videoDataset: <p>Annotation isn&rsquo;t supported for video datasets.</p>,
};

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
  const editing = useAtomValue(isEditing);

  if (editing) return null;

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
            const { kind: _, atom } = entry;
            return {
              children: <LabelEntry atom={atom} />,
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
        modal={true}
      />
    </>
  );
};

interface AnnotateProps {
  disabledReason: AnnotationDisabledReason;
}

const Annotate = ({ disabledReason }: AnnotateProps) => {
  const showSchemaModal = useAtomValue(showModal);
  const showImport = useAtomValue(showImportPage);
  const loading = useAtomValue(schemas) === null;
  const editing = useAtomValue(isEditing);

  const isDisabled = disabledReason !== null;
  const disabledMsg =
    disabledReason !== null ? DISABLED_MESSAGES[disabledReason] : undefined;

  if (!isDisabled && loading) {
    return <Loading />;
  }

  return (
    <>
      {editing && <Edit key="edit" />}
      {showImport ? (
        <ImportSchema
          key="import"
          disabled={isDisabled}
          disabledMsg={disabledMsg}
        />
      ) : (
        <AnnotateSidebar key="annotate" />
      )}
      {showSchemaModal && <SchemaManager key="manage" />}
    </>
  );
};

export default Annotate;
