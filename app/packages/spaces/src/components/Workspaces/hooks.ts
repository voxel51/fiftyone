import { executeOperator, useOperatorAvailability } from "@fiftyone/operators";
import { datasetName } from "@fiftyone/state";
import { toSlug } from "@fiftyone/utilities";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  useReverbState,
  useReverbValue,
  useResetReverbState,
} from "@fiftyone/reverb";
import { savedWorkspacesAtom, Workspace } from "../../state";
import { LIST_WORKSPACES_OPERATOR, LOAD_WORKSPACE_OPERATOR } from "./constants";

export function useWorkspaces() {
  const [state, setState] = useReverbState(savedWorkspacesAtom);
  const resetState = useResetReverbState(savedWorkspacesAtom);
  const [listWorkspaceExecuting, setListWorkspaceExecuting] = useState(false);
  const currentDataset = useReverbValue(datasetName);
  const listWorkspacesAvailable = useOperatorAvailability(
    LIST_WORKSPACES_OPERATOR,
  );

  const listWorkspace = useCallback(() => {
    if (listWorkspaceExecuting || !listWorkspacesAvailable) return;
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
  }, [
    listWorkspaceExecuting,
    setState,
    currentDataset,
    listWorkspacesAvailable,
  ]);

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
    canInitialize: listWorkspacesAvailable,
  };
}
