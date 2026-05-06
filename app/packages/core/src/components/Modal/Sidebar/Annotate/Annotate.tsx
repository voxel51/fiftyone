import { LoadingSpinner } from "@fiftyone/components";
import { Text, TextColor, TextVariant } from "@voxel51/voodo";
import { useAtomValue } from "jotai";
import React, { useEffect } from "react";
import styled from "styled-components";
import Actions from "./Actions";
import Edit, { isEditing } from "./Edit";
import ImportSchema, { useShowImportSchema } from "./ImportSchema";
import SchemaManager from "./SchemaManager";
import { useSchemaManagerModal } from "./SchemaManager/hooks";
import { labelSchemasData } from "./state";
import type { AnnotationDisabledReason } from "./useCanAnnotate";
import useSourceFieldToActivate from "./useSourceFieldToActivate";
import useLabels from "./useLabels";
import { useAnnotationContextManager } from "./useAnnotationContextManager";
import useDelete from "./Edit/useDelete";
import { useRegisterPolylineSidebarSyncHandlers } from "./Edit/useRegisterPolylineSidebarSyncHandlers";
import { KnownContexts, useUndoRedo } from "@fiftyone/commands";
import LabelList from "./LabelList";
import { useRegisterAIAnnotationEventHandlers } from "@fiftyone/annotation/src/agents/hooks/useRegisterAIAnnotationEventHandlers";

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

interface AnnotateProps {
  disabledReason: AnnotationDisabledReason;
}

const Annotate = ({ disabledReason }: AnnotateProps) => {
  useRegisterAIAnnotationEventHandlers();
  useRegisterPolylineSidebarSyncHandlers();

  const { schemaManagerDisplayed } = useSchemaManagerModal();
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
      {!showSetup && <Actions key="actions" />}
      {isEditingValue && <Edit key="edit" />}
      {showSetup ? (
        <ImportSchema
          key="import"
          disabled={isDisabled}
          disabledMsg={disabledMsg}
          requiredField={requiredField}
        />
      ) : (
        <LabelList key="annotate" />
      )}
      {schemaManagerDisplayed && <SchemaManager key="manage" />}
    </>
  );
};

export default Annotate;
