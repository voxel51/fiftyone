import { executeOperator } from "@fiftyone/operators";
import { canEditWorkspaces, datasetName, readOnly } from "@fiftyone/state";
import { toSlug } from "@fiftyone/utilities";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRecoilState, useRecoilValue, useResetRecoilState } from "recoil";
import { savedWorkspacesAtom } from "../../state";
import { LIST_WORKSPACES_OPERATOR, LOAD_WORKSPACE_OPERATOR } from "./constants";

export function useWorkspaces() {
  const [state, setState] = useRecoilState(savedWorkspacesAtom);
  const resetState = useResetRecoilState(savedWorkspacesAtom);
  const [listWorkspaceExecuting, setListWorkspaceExecuting] = useState(false);
  const currentDataset = useRecoilValue(datasetName);

  const listWorkspace = useCallback(() => {
    if (listWorkspaceExecuting) return;
    setListWorkspaceExecuting(true);
    executeOperator(
      LIST_WORKSPACES_OPERATOR,
      {},
      {
        callback: (result) => {
          setState((state) => {
            return {
              ...state,
              initialized: true,
              workspaces: result?.result?.workspaces,
              dataset: currentDataset,
            };
          });
          setListWorkspaceExecuting(false);
          if (result.error) {
            console.error(result.error);
          }
        },
        skipOutput: true,
      }
    );
  }, [listWorkspaceExecuting, setState, currentDataset]);

  const loadWorkspace = useCallback((name: string) => {
    executeOperator(LOAD_WORKSPACE_OPERATOR, { name }, { skipOutput: true });
  }, []);

  const existingSlugs = useMemo(() => {
    return state.workspaces.map(({ name }) => toSlug(name));
  }, [state.workspaces]);

  useEffect(() => {
    if (currentDataset !== state.dataset) {
      resetState();
    }
  }, [currentDataset, state, resetState]);

  return {
    initialized: state.initialized,
    workspaces: state.workspaces || [],
    loadWorkspace,
    listWorkspace,
    reset: resetState,
    existingSlugs,
  };
}

export function useWorkspacePermission() {
  const canEditSavedViews = useRecoilValue(canEditWorkspaces);
  const isReadOnly = useRecoilValue(readOnly);
  const canEdit = useMemo(
    () => canEditSavedViews && !isReadOnly,
    [canEditSavedViews, isReadOnly]
  );
  const disabledInfo = useMemo(() => {
    return !canEditSavedViews
      ? "You do not have permission to save a workspace"
      : isReadOnly
      ? "Can not save workspace in read-only mode"
      : undefined;
  }, [canEditSavedViews, isReadOnly]);

  return { canEdit, disabledInfo };
}
