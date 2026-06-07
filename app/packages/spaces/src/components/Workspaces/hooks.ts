import { executeOperator } from "@fiftyone/operators";
import { datasetName } from "@fiftyone/state";
import { toSlug } from "@fiftyone/utilities";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRecoilState, useRecoilValue, useResetRecoilState } from "recoil";
import { savedWorkspacesAtom } from "../../state";
import { LIST_WORKSPACES_OPERATOR, LOAD_WORKSPACE_OPERATOR } from "./constants";
import {
  availableOperators,
  operatorsInitializedAtom,
} from "@fiftyone/operators/src/state";

/**
 * Manages workspace loading, listing, and cached workspace state.
 */
export function useWorkspaces() {
  const [state, setState] = useRecoilState(savedWorkspacesAtom);
  const resetState = useResetRecoilState(savedWorkspacesAtom);
  const [listWorkspaceExecuting, setListWorkspaceExecuting] = useState(false);
  const currentDataset = useRecoilValue(datasetName);
  const operatorsInitialized = useRecoilValue(operatorsInitializedAtom);
  const operators = useRecoilValue(availableOperators);
  const hasListWorkspaces = useMemo(
    () => operators.some((op) => op.value === LIST_WORKSPACES_OPERATOR),
    [operators]
  );

  /**
   * Requests the current dataset's saved workspaces from the backend.
   */
  const listWorkspace = useCallback(() => {
    if (listWorkspaceExecuting || !operatorsInitialized || !currentDataset) {
      return;
    }
    if (!hasListWorkspaces) {
      setState((prev) => ({
        ...prev,
        initialized: true,
        workspaces: [],
        dataset: currentDataset,
      }));
      setListWorkspaceExecuting(false);
      return;
    }
    setListWorkspaceExecuting(true);
    executeOperator(
      LIST_WORKSPACES_OPERATOR,
      {},
      {
        callback: (result) => {
          const workspaces = (
            result?.result as { workspaces?: typeof state.workspaces }
          )?.workspaces || [];

          setState({
            initialized: true,
            workspaces,
            dataset: currentDataset,
          });
          setListWorkspaceExecuting(false);
          if (result.error) {
            console.error(result.error);
          }
        },
        skipOutput: true,
      }
    );
  }, [
    listWorkspaceExecuting,
    setState,
    currentDataset,
    operatorsInitialized,
    hasListWorkspaces,
  ]);

  /**
   * Opens a saved workspace by name.
   */
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
    canInitialize: operatorsInitialized,
  };
}