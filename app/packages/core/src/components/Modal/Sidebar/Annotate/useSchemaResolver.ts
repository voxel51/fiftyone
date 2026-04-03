import { useOperatorExecutor } from "@fiftyone/operators";
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
  request: T
): Promise<R> => {
  return new Promise((resolve, reject) => {
    const operatorCallback: OperatorCallback<R> = (
      response: OperatorResponse<R>
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

export type SchemaManagementOps = Pick<
  SchemaManager,
  "activateSchemas" | "initializeSchema"
>;

// Module-level holder for management ops (non-serializable — cannot go in Redux)
let _schemaManagementOps: SchemaManagementOps | null = null;

export const getSchemaManagementOps = (): SchemaManagementOps | null =>
  _schemaManagementOps;

export const useRegisterSchemaManagement = (schemaManager: SchemaManager) => {
  useEffect(() => {
    _schemaManagementOps = {
      activateSchemas: schemaManager.activateSchemas,
      initializeSchema: schemaManager.initializeSchema,
    };

    return () => {
      _schemaManagementOps = null;
    };
  }, [schemaManager]);
};

export interface SchemaResolver {
  listSchemas: (request: ListSchemasRequest) => Promise<ListSchemasResponse>;
}

export const useSchemaResolver = (): SchemaResolver => {
  const listSchemasOperator = useOperatorExecutor(
    "@voxel51/operators/get_label_schemas"
  ) as Operator<ListSchemasRequest, ListSchemasResponse>;

  const listSchemas = useCallback(
    (request: ListSchemasRequest): Promise<ListSchemasResponse> => {
      return operatorAsPromise(listSchemasOperator, request);
    },
    [listSchemasOperator]
  );

  return useMemo(() => ({ listSchemas }), [listSchemas]);
};
