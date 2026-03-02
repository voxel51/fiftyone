import { LoadingSpinner } from "@fiftyone/components";
import { EntryKind, isGeneratedView } from "@fiftyone/state";
import { Text, TextColor, TextVariant } from "@voxel51/voodo";
import { atom, useAtomValue } from "jotai";
import React, { useEffect } from "react";
import { useRecoilValue } from "recoil";
import styled from "styled-components";
import Sidebar from "../../../Sidebar";
import Actions from "./Actions";
import Edit, { isEditing } from "./Edit";
import GroupEntry from "./GroupEntry";
import ImportSchema, { useShowImportSchema } from "./ImportSchema";
import LabelEntry from "./LabelEntry";
import LoadingEntry from "./LoadingEntry";
import PrimitiveEntry from "./PrimitiveEntry";
import SchemaManager from "./SchemaManager";
import { labelSchemasData, showModal } from "./state";
import type { AnnotationDisabledReason } from "./useCanAnnotate";
import useEntries from "./useEntries";
import useSourceFieldToActivate from "./useSourceFieldToActivate";
import useLabels from "./useLabels";
import { usePrimitivesCount } from "./usePrimitivesCount";
import { useAnnotationContextManager } from "./useAnnotationContextManager";
import useDelete from "./Edit/useDelete";
import { KnownContexts, useUndoRedo } from "@fiftyone/commands";

const DISABLED_MESSAGES: Record<
  Exclude<AnnotationDisabledReason, null>,
  React.ReactNode
> = {
  generatedView: (
    <p>
      Annotation isn&rsquo;t supported for frames, clips, or materialized views.
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

const EmptyLabelsContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 1.5rem 1rem;
  gap: 0.5rem;
`;

const Loading = () => {
  return (
    <Container>
      <LoadingSpinner />
      <Text
        color={TextColor.Secondary}
        variant={TextVariant.Md}
        style={{ padding: "1rem 0" }}
      >
        Loading
      </Text>
    </Container>
  );
};

const AnnotateSidebar = () => {
  usePrimitivesCount();
  const isEditingValue = useAtomValue(isEditing);
  const isGenerated = useRecoilValue(isGeneratedView);
  const [entries] = useEntries();

  // Don't show label list in edit mode or in generated views (patches/clips/frames)
  // In generated views, only the edit panel should be visible
  if (isEditingValue || isGenerated) return null;

  return (
    <>
      <Actions />
      <Sidebar
        isDisabled={() => true}
        render={(_key, _group, entry) => {
          if (entry.kind === EntryKind.GROUP) {
            return { children: <GroupEntry name={entry.name} /> };
          }

          if (entry.kind === EntryKind.LABEL) {
            const { kind: _kind, atom } = entry;
            return {
              children: <LabelEntry atom={atom} />,
              disabled: true,
            };
          }

          if (entry.kind === EntryKind.EMPTY_ANNOTATIONS) {
            return {
              children: (
                <EmptyLabelsContainer>
                  <Text variant={TextVariant.Lg}>No labels to annotate</Text>
                  <Text
                    color={TextColor.Secondary}
                    variant={TextVariant.Md}
                    style={{ textAlign: "center" }}
                  >
                    Check that your fields are enabled on Explore.
                  </Text>
                </EmptyLabelsContainer>
              ),
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
  const loading = useAtomValue(labelSchemasData) === null;
  const isEditingValue = useAtomValue(isEditing);
  const contextManager = useAnnotationContextManager();
  const { clear: clearUndo } = useUndoRedo(KnownContexts.ModalAnnotate);

  const isDisabled = disabledReason !== null;
  const requiredField = useSourceFieldToActivate();
  const showSetup = useShowImportSchema(isDisabled, requiredField);

  useLabels();
  useDelete();

  useEffect(() => {
    contextManager.enter();

    return () => {
      contextManager.exit();
      clearUndo();
    };
  }, []);

  const disabledMsg =
    disabledReason !== null ? DISABLED_MESSAGES[disabledReason] : undefined;

  if (!isDisabled && loading) {
    return <Loading />;
  }

  return (
    <>
      {isEditingValue && <Edit key="edit" />}
      {showSetup ? (
        <ImportSchema
          key="import"
          disabled={isDisabled}
          disabledMsg={disabledMsg}
          requiredField={requiredField}
        />
      ) : (
        <AnnotateSidebar key="annotate" />
      )}
      {showSchemaModal && <SchemaManager key="manage" />}
    </>
  );
};

export default Annotate;
