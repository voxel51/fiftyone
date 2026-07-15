import { useRegisterAIAnnotationEventHandlers } from "@fiftyone/annotation/src/agents/hooks/useRegisterAIAnnotationEventHandlers";
import { KnownContexts, useUndoRedo } from "@fiftyone/commands";
import { LoadingSpinner } from "@fiftyone/components";
import { useIsGroupDataset } from "@fiftyone/state";
import { Text, TextColor, TextVariant } from "@voxel51/voodo";
import { useAtomValue } from "jotai";
import React, { useEffect } from "react";
import styled from "styled-components";
import Actions from "./Actions";
import Edit from "./Edit";
import useDelete from "./Edit/useDelete";
import { useAnnotationContext } from "./Edit/useAnnotationContext";
import GroupAnnotation from "./GroupAnnotation";
import ImportSchema, { useShowImportSchema } from "./ImportSchema";
import LabelList from "./LabelList";
import { labelSchemasData } from "./state";
import { useAnnotationContextManager } from "./useAnnotationContextManager";
import { useEngineUndoableBridge } from "./useEngineUndoableBridge";
import { useFormAnchor } from "./useFormAnchor";
import type { AnnotationDisabledReason } from "./useCanAnnotate";
import useLabels from "./useLabels";
import { useRegisterPolylineSidebarSyncHandlers } from "./Edit/useRegisterPolylineSidebarSyncHandlers";
import useSourceFieldToActivate from "./useSourceFieldToActivate";
import {
  useSaveSettlement,
  useSync3dModalSample,
  useSyncAnnotationEngine,
  useSyncModalSample,
} from "@fiftyone/annotation";
import { useLighterAnnotationBridge } from "./useLighterAnnotationBridge";
import { useLooker3dAnnotationBridge } from "./useLooker3dAnnotationBridge";
import { useSyncAnnotationSliceMediaType } from "./useSyncAnnotationSliceMediaType";

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
  multimodalDataset: (
    <p>Annotation isn&rsquo;t supported for multimodal datasets.</p>
  ),
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

/**
 * Invisible save-settlement marker: `data-settled` is "true" iff every
 * annotation edit has been persisted (no pending deltas, no in-flight patch).
 * Autosave is an interval tick, so an edit's patch may start seconds after its
 * commit — tests that hand off to a fresh load (or another test) await this
 * seam instead of racing the tick.
 */
const SaveSettlementMarker = () => {
  const settled = useSaveSettlement();

  return (
    <div
      data-cy="annotation-save-state"
      data-settled={settled ? "true" : "false"}
      style={{ display: "none" }}
    />
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
  const isEditingValue = useAnnotationContext().isEditing;
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
  useSync3dModalSample();
  useSyncAnnotationEngine();
  useSyncAnnotationSliceMediaType();
  useEngineUndoableBridge();
  useLighterAnnotationBridge();
  useLooker3dAnnotationBridge();
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
      <SaveSettlementMarker key="save-state" />
      <AnnotationBody
        disabledReason={disabledReason}
        key="body"
        loadSchemas={loadSchemas}
      />
    </>
  );
};

export default Annotate;
