import { executeOperator } from "@fiftyone/operators";
import { datasetName } from "@fiftyone/state";
import { toSlug } from "@fiftyone/utilities";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRecoilState, useRecoilValue, useResetRecoilState } from "recoil";
import { savedWorkspacesAtom, Workspace } from "../../state";
import { LIST_WORKSPACES_OPERATOR, LOAD_WORKSPACE_OPERATOR } from "./constants";
import { usePluginRuntimeStatus } from "@fiftyone/plugins/src/Runtime";

export function useWorkspaces() {
  const [state, setState] = useRecoilState(savedWorkspacesAtom);
  const resetState = useResetRecoilState(savedWorkspacesAtom);
  const [listWorkspaceExecuting, setListWorkspaceExecuting] = useState(false);
  const currentDataset = useRecoilValue(datasetName);
  const { ready: runtimeReady } = usePluginRuntimeStatus();

  const listWorkspace = useCallback(() => {
    if (listWorkspaceExecuting || !runtimeReady) return;
    setListWorkspaceExecuting(true);
    executeOperator(
      LIST_WORKSPACES_OPERATOR,
      {},
      {
        callback: (result) => {
          const maybeWorkspaces = (
            result?.result as { workspaces?: Workspace[] }
          )?.workspaces;
          setState((state) => {
            return {
              ...state,
              initialized: true,
              workspaces: Array.isArray(maybeWorkspaces) ? maybeWorkspaces : [],
              dataset: currentDataset,
            };
          });
          setListWorkspaceExecuting(false);
          if (result.error) {
            console.error(result.error);
          }
        },
        skipOutput: true,
      },
    );
  }, [listWorkspaceExecuting, setState, currentDataset, runtimeReady]);

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
    canInitialize: runtimeReady,
  };
}
