import { executeOperator, useFirstExistingUri } from "@fiftyone/operators";
import { datasetName } from "@fiftyone/state";
import { toSlug } from "@fiftyone/utilities";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRecoilState, useRecoilValue, useResetRecoilState } from "recoil";
import { savedWorkspacesAtom } from "../../state";
import { LIST_WORKSPACES_OPERATOR, LOAD_WORKSPACE_OPERATOR } from "./constants";
import { operatorsInitializedAtom } from "@fiftyone/operators/src/state";

export function useWorkspaces() {
  const [state, setState] = useRecoilState(savedWorkspacesAtom);
  const resetState = useResetRecoilState(savedWorkspacesAtom);
  const [listWorkspaceExecuting, setListWorkspaceExecuting] = useState(false);
  const currentDataset = useRecoilValue(datasetName);
  const operatorsInitialized = useRecoilValue(operatorsInitializedAtom);
  const { firstExistingUri: listWorkspacesUri, exists: hasListWorkspaces } =
    useFirstExistingUri([LIST_WORKSPACES_OPERATOR]);
  const { firstExistingUri: loadWorkspaceUri, exists: hasLoadWorkspace } =
    useFirstExistingUri([LOAD_WORKSPACE_OPERATOR]);

  const listWorkspace = useCallback(() => {
    if (listWorkspaceExecuting || !operatorsInitialized) return;

    if (!hasListWorkspaces || !listWorkspacesUri) {
      setState((state) => {
        return {
          ...state,
          initialized: true,
          workspaces: [],
          dataset: currentDataset,
        };
      });
      return;
    }

    setListWorkspaceExecuting(true);
    executeOperator(listWorkspacesUri, {}, {
      callback: (result) => {
        setState((state) => {
          return {
            ...state,
            initialized: true,
            workspaces: result?.result?.workspaces || [],
            dataset: currentDataset,
          };
        });
        setListWorkspaceExecuting(false);
        if (result.error) {
          console.error(result.error);
        }
      },
      skipOutput: true,
      skipErrorNotification: true,
    }).catch((error) => {
      setState((state) => {
        return {
          ...state,
          initialized: true,
          workspaces: [],
          dataset: currentDataset,
        };
      });
      setListWorkspaceExecuting(false);
      console.error(error);
    });
  }, [
    listWorkspaceExecuting,
    setState,
    currentDataset,
    operatorsInitialized,
    hasListWorkspaces,
    listWorkspacesUri,
  ]);

  const loadWorkspace = useCallback((name: string) => {
    if (!hasLoadWorkspace || !loadWorkspaceUri) return;
    executeOperator(loadWorkspaceUri, { name }, { skipOutput: true });
  }, [hasLoadWorkspace, loadWorkspaceUri]);

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
    canInitialize: operatorsInitialized,
  };
}
