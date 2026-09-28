import { useRegisterAIAnnotationEventHandlers } from "@fiftyone/annotation/src/agents/hooks/useRegisterAIAnnotationEventHandlers";
import { KnownContexts, useUndoRedo } from "@fiftyone/commands";
import { EnterpriseUpsellCallout, LoadingSpinner } from "@fiftyone/components";
import {
  useBrowserStorage,
  useCurrentSampleId,
  useIsGroupDataset,
  useIsVideo,
} from "@fiftyone/state";
import { Text, TextColor, TextVariant } from "@voxel51/voodo";
import { useAtomValue } from "jotai";
import React, { useEffect } from "react";
import styled from "styled-components";
import Actions from "./Actions";
import AIAnnotationPanel from "./AIAnnotationPanel";
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
import { Box } from "@mui/material";

/** Persists (per browser) the user's dismissal of the video-AI upsell. */
const AI_UPSELL_DISMISSED_KEY = "fo-annotate-video-ai-upsell-dismissed";

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
  dynamicGroupNotQueryPerformant: (
    <p>
      Annotating dynamic groups requires a query performant view. Group by a
      field with <code>order_by</code> and <code>order_by_key</code> set, and
      create a compound unique index on the group and order fields.
    </p>
  ),
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
  const isVideo = useIsVideo();
  const [upsellDismissed, setUpsellDismissed] = useBrowserStorage<boolean>(
    AI_UPSELL_DISMISSED_KEY,
    false,
  );

  return (
    <>
      {isGroupDataset && !disabledReason && (
        <GroupAnnotation onSliceSelected={loadSchemas} />
      )}
      {!showSetup && !disabledReason && isVideo && !upsellDismissed && (
        <Box sx={{ m: 2 }}>
          <EnterpriseUpsellCallout
            data-cy="annotate-video-ai-upsell"
            title="More powerful AI in Enterprise"
            description="Annotate with built-in AI – segment, detect, and track objects right now. Upgrade to FiftyOne Enterprise to switch to more powerful models and unlock the full AI toolset across every annotation type."
            onDismiss={() => setUpsellDismissed(true)}
          />
        </Box>
      )}
      {!showSetup && <Actions key="actions" hidden={isEditingValue} />}
      {!showSetup && <AIAnnotationPanel key="ai-panel" />}
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
  const currentSampleId = useCurrentSampleId();

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

  // Clear undo history on sample change; its commands pin the prior sample's
  // overlays (and paint snapshots) for redo.
  useEffect(() => {
    clearUndo();
  }, [currentSampleId, clearUndo]);

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
