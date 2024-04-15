import { useOperatorExecutor } from "@fiftyone/operators";
import { canEditWorkspaces, readOnly } from "@fiftyone/state";
import { toSlug } from "@fiftyone/utilities";
import { useEffect, useMemo } from "react";
import { useRecoilState, useRecoilValue, useResetRecoilState } from "recoil";
import { Workspace, savedWorkspacesAtom } from "../../state";

export function useSavedSpaces() {
  const [state, setState] = useRecoilState(savedWorkspacesAtom);
  const resetState = useResetRecoilState(savedWorkspacesAtom);
  const listOperator = useOperatorExecutor(
    "@voxel51/operators/list_saved_workspaces"
  );
  const loadOperator = useOperatorExecutor("@voxel51/operators/load_workspace");

  const listWorkspace = () => {
    listOperator.execute({});
  };

  const loadWorkspace = (name: string) => {
    loadOperator.execute({ name });
  };
  const existingSlugs = useMemo(() => {
    return state.workspaces.map(({ name }) => toSlug(name));
  }, [state.workspaces]);

  useEffect(() => {
    if (listOperator.hasExecuted) {
      // @ts-ignore
      const workspaces: Workspace[] = listOperator.result?.workspaces || [];
      setState((state) => ({
        ...state,
        initialized: true,
        workspaces,
      }));
      listOperator.clear();
    }
  }, [listOperator.hasExecuted, listOperator.result]);

  return {
    initialized: state.initialized,
    savedSpaces: state.workspaces || [],
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
