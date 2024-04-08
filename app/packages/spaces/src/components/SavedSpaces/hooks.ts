import { useOperatorExecutor } from "@fiftyone/operators";
import { useEffect, useMemo } from "react";
import { useRecoilState, useResetRecoilState } from "recoil";
import { savedWorkspacesAtom } from "../../state";
import { toSlug } from "@fiftyone/utilities";

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
    return state.workspaces.map((w) => toSlug(w.name));
  }, [state.workspaces]);

  useEffect(() => {
    if (listOperator.hasExecuted) {
      setState((state) => ({
        ...state,
        initialized: true,
        workspaces: listOperator.result?.workspaces || [],
      }));
      listOperator.clear();
    }
  }, [listOperator.result]);

  return {
    initialized: state.initialized,
    savedSpaces: state.workspaces || [],
    loadWorkspace,
    listWorkspace,
    reset: resetState,
    existingSlugs,
  };
}
