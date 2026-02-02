import { LoadingSpinner } from "@fiftyone/components";
import { EntryKind } from "@fiftyone/state";
import { Typography } from "@mui/material";
import { atom, useAtomValue } from "jotai";
import React, { useEffect } from "react";
import styled from "styled-components";
import Sidebar from "../../../Sidebar";
import Actions from "./Actions";
import Edit, { isEditing } from "./Edit";
import GroupEntry from "./GroupEntry";
import ImportSchema from "./ImportSchema";
import LabelEntry from "./LabelEntry";
import LoadingEntry from "./LoadingEntry";
import PrimitiveEntry from "./PrimitiveEntry";
import SchemaManager from "./SchemaManager";
import { activeLabelSchemas, labelSchemasData, showModal } from "./state";
import type { AnnotationDisabledReason } from "./useCanAnnotate";
import useEntries from "./useEntries";
import useLabels from "./useLabels";
import { usePrimitivesCount } from "./usePrimitivesCount";
import { useAnnotationContextManager } from "./useAnnotationContextManager";
import useDelete from "./Edit/useDelete";
import { KnownContexts, useUndoRedo } from "@fiftyone/commands";

const showImportPage = atom((get) => !get(activeLabelSchemas)?.length);

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
  groupedDatasetNoSupportedSlices: (
    <p>
      This grouped dataset has no slices that support annotation. Only image and
      3D slices can be annotated.
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
  usePrimitivesCount();
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

          if (entry.kind === EntryKind.PATH) {
            return {
              children: <PrimitiveEntry path={entry.path} />,
              disabled: false,
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
  const loading = useAtomValue(labelSchemasData) === null;
  const editing = useAtomValue(isEditing);
  const contextManager = useAnnotationContextManager();
  const { clear: clearUndo } = useUndoRedo(KnownContexts.ModalAnnotate);
  useDelete();

  useEffect(() => {
    contextManager.enter();

    return () => {
      contextManager.exit();
      clearUndo();
    };
  }, []);

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
