import { LoadingSpinner } from "@fiftyone/components";
import { useLighter } from "@fiftyone/lighter";
import { EntryKind, isGeneratedView, isPatchesView } from "@fiftyone/state";
import { Typography } from "@mui/material";
import { atom, getDefaultStore, useAtomValue, useSetAtom } from "jotai";
import React, { useEffect, useRef } from "react";
import { useRecoilValue } from "recoil";
import styled from "styled-components";
import Sidebar from "../../../Sidebar";
import Actions from "./Actions";
import Edit, { editing, isEditing } from "./Edit";
import { savedLabel } from "./Edit/state";
import GroupEntry from "./GroupEntry";
import ImportSchema from "./ImportSchema";
import LabelEntry from "./LabelEntry";
import LoadingEntry from "./LoadingEntry";
import PrimitiveEntry from "./PrimitiveEntry";
import SchemaManager from "./SchemaManager";
import { activeLabelSchemas, labelSchemasData, showModal } from "./state";
import type { AnnotationDisabledReason } from "./useCanAnnotate";
import useEntries from "./useEntries";
import useLabels, { LabelsState, labelsState } from "./useLabels";
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
      <Typography color="secondary" padding="1rem 0">
        Loading
      </Typography>
    </Container>
  );
};

const AnnotateSidebar = () => {
  usePrimitivesCount();
  const isEditingValue = useAtomValue(isEditing);
  const setEditing = useSetAtom(editing);
  const isPatches = useRecoilValue(isPatchesView);
  const isGenerated = useRecoilValue(isGeneratedView);
  const [entries] = useEntries();
  const { scene } = useLighter();
  const loadingState = useAtomValue(labelsState);

  // Track the previous loading state to detect fresh loads
  const prevLoadingState = useRef<LabelsState>(LabelsState.UNSET);

  // Auto-edit single label in patches view
  useEffect(() => {
    // Only auto-edit when labels just finished loading (LOADING -> COMPLETE)
    // This prevents re-triggering after save/exit while still on the same sample
    const justLoaded =
      prevLoadingState.current !== LabelsState.COMPLETE &&
      loadingState === LabelsState.COMPLETE;

    prevLoadingState.current = loadingState;

    if (!justLoaded || !isPatches || isEditingValue) return;

    const labelEntries = entries.filter(
      (entry) => entry.kind === EntryKind.LABEL
    );
    if (labelEntries.length === 1) {
      const labelEntry = labelEntries[0];
      if (labelEntry.kind === EntryKind.LABEL) {
        const store = getDefaultStore();
        const label = store.get(labelEntry.atom);

        // Ensure overlay exists and is valid
        if (!label?.overlay?.id) return;

        // Replicate exactly what LabelEntry.onClick does:
        // 1. Select overlay in scene (for visual highlight and drag/resize)
        scene?.selectOverlay(label.overlay.id);

        // 2. Set editing state (for sidebar edit panel)
        setEditing(labelEntry.atom);

        // 3. Set savedLabel (for change detection)
        store.set(savedLabel, label.data);
      }
    }
  }, [isPatches, isEditingValue, entries, setEditing, scene, loadingState]);

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

  useLabels();
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
      {showImport || isDisabled ? (
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
