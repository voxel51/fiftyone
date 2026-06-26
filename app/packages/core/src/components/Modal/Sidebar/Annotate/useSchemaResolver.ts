import { useOperatorExecutor } from "@fiftyone/operators";
import { atom, useSetAtom } from "jotai";
import { useCallback, useEffect, useMemo } from "react";
import {
  type ListSchemasRequest,
  type ListSchemasResponse,
  type SchemaManager,
} from "./useSchemaManager";

type OperatorResponse<T> = {
  result: T;
  error?: string;
};

type OperatorCallback<T> = (response: OperatorResponse<T>) => void;

type Operator<T, R> = {
  execute: (request: T, options: { callback?: OperatorCallback<R> }) => void;
};

const operatorAsPromise = <T, R>(
  operator: Operator<T, R>,
  request: T,
): Promise<R> => {
  return new Promise((resolve, reject) => {
    const operatorCallback: OperatorCallback<R> = (
      response: OperatorResponse<R>,
    ) => {
      if (response.error) {
        reject(new Error(response.error));
      } else {
        resolve(response.result);
      }
    };

    operator.execute(request, { callback: operatorCallback });
  });
};

/**
 * Schema management operations that require elevated permissions.
 */
export type SchemaManagementOps = Pick<
  SchemaManager,
  "activateSchemas" | "initializeSchema"
>;

/**
 * Atom holding management operations. Populated by {@link useRegisterSchemaManagement}
 * when the user has schema management permissions.
 */
export const schemaManagementOpsAtom = atom<SchemaManagementOps | null>(null);

/**
 * Hook to register schema management operations into the shared atom.
 *
 * Must be called from a component that only renders when the user has
 * schema management permissions.
 *
 * @param schemaManager The full schema manager instance
 */
export const useRegisterSchemaManagement = (schemaManager: SchemaManager) => {
  const setOps = useSetAtom(schemaManagementOpsAtom);

  useEffect(() => {
    setOps({
      activateSchemas: schemaManager.activateSchemas,
      initializeSchema: schemaManager.initializeSchema,
    });

    return () => setOps(null);
  }, [schemaManager, setOps]);
};

/**
 * Read-only schema resolver for annotation context.
 *
 * Only resolves operators available to all roles (`get_label_schemas`).
 */
export interface SchemaResolver {
  listSchemas: (request: ListSchemasRequest) => Promise<ListSchemasResponse>;
}

export const useSchemaResolver = (): SchemaResolver => {
  const listSchemasOperator = useOperatorExecutor(
    "@voxel51/operators/get_label_schemas",
  ) as Operator<ListSchemasRequest, ListSchemasResponse>;

  const listSchemas = useCallback(
    (request: ListSchemasRequest): Promise<ListSchemasResponse> => {
      return operatorAsPromise(listSchemasOperator, request);
    },
    [listSchemasOperator],
  );

  return useMemo(() => ({ listSchemas }), [listSchemas]);
};
