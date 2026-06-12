import { useRegisterAIAnnotationEventHandlers } from "@fiftyone/annotation/src/agents/hooks/useRegisterAIAnnotationEventHandlers";
import { KnownContexts, useUndoRedo } from "@fiftyone/commands";
import { LoadingSpinner } from "@fiftyone/components";
import { useIsGroupDataset } from "@fiftyone/state";
import { Text, TextColor, TextVariant } from "@voxel51/voodo";
import { useAtomValue } from "jotai";
import React, { useEffect } from "react";
import styled from "styled-components";
import Actions from "./Actions";
import Edit, { isEditing } from "./Edit";
import useDelete from "./Edit/useDelete";
import GroupAnnotation from "./GroupAnnotation";
import ImportSchema, { useShowImportSchema } from "./ImportSchema";
import LabelList from "./LabelList";
import { labelSchemasData } from "./state";
import { useAnnotationContextManager } from "./useAnnotationContextManager";
import { useFormAnchor } from "./useFormAnchor";
import type { AnnotationDisabledReason } from "./useCanAnnotate";
import useLabels from "./useLabels";
import { useRegisterPolylineSidebarSyncHandlers } from "./Edit/useRegisterPolylineSidebarSyncHandlers";
import useSourceFieldToActivate from "./useSourceFieldToActivate";
import {
  useSync3dSample,
  useSyncAnnotationEngine,
  useSyncModalSample,
} from "@fiftyone/annotation";
import { useLighterAnnotationBridge } from "./useLighterAnnotationBridge";

const DISABLED_MESSAGES: Record<
  Exclude<AnnotationDisabledReason, null>,
  React.ReactNode
> = {
  generatedView: (
    <p>
      Annotation isn&rsquo;t supported for frames, clips, or materialized views.
    </p>
  ),
  groupDatasetNoSupportedSlices: (
    <p>
      This group dataset has no slices that support annotation. Only image and
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

const useDisabledMessage = (disabledReason: AnnotationDisabledReason) => {
  return disabledReason !== null
    ? DISABLED_MESSAGES[disabledReason]
    : undefined;
};

const AnnotationBody = ({
  disabledReason,
  loadSchemas,
}: {
  disabledReason: AnnotationDisabledReason;
  loadSchemas: () => void;
}) => {
  const isEditingValue = useAtomValue(isEditing);
  const requiredField = useSourceFieldToActivate();
  const isGroupDataset = useIsGroupDataset();
  const disabledMessage = useDisabledMessage(disabledReason);
  const showSetup = useShowImportSchema(!!disabledReason, requiredField);

  return (
    <>
      {isGroupDataset && !disabledReason && (
        <GroupAnnotation onSliceSelected={loadSchemas} />
      )}
      {!showSetup && <Actions key="actions" />}
      {isEditingValue && <Edit key="edit" />}
      {showSetup ? (
        <ImportSchema
          key="import"
          disabled={!!disabledReason}
          disabledMsg={disabledMessage}
          requiredField={requiredField}
        />
      ) : (
        <LabelList key="annotate" />
      )}
    </>
  );
};

interface AnnotateProps {
  disabledReason: AnnotationDisabledReason;
  loadSchemas: () => void;
}

const Annotate = ({ disabledReason, loadSchemas }: AnnotateProps) => {
  useSyncModalSample();
  useSyncAnnotationEngine();
  useLighterAnnotationBridge();
  useSync3dSample();
  useFormAnchor();
  useRegisterAIAnnotationEventHandlers();
  useRegisterPolylineSidebarSyncHandlers();

  const loading = useAtomValue(labelSchemasData) === null;

  const contextManager = useAnnotationContextManager();
  const { clear: clearUndo } = useUndoRedo(KnownContexts.ModalAnnotate);

  const isDisabled = disabledReason !== null;

  useLabels();
  useDelete();

  useEffect(() => {
    contextManager.enter();

    return () => {
      contextManager.exit();
      clearUndo();
    };
  }, []);

  if (!isDisabled && loading) {
    return <Loading />;
  }

  return (
    <>
      <AnnotationBody
        disabledReason={disabledReason}
        key="body"
        loadSchemas={loadSchemas}
      />
    </>
  );
};

export default Annotate;
