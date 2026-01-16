import { useCallback, useMemo } from "react";
import { useOperatorExecutor } from "@fiftyone/operators";

/**
 * Schema field types.
 */
type FieldType =
  | "bool"
  | "date"
  | "datetime"
  | "dict"
  | "float"
  | "id"
  | "int"
  | "list<bool>"
  | "list<int>"
  | "list<float>"
  | "list<str>"
  | "str";

/**
 * Schema component types.
 */
type ComponentType =
  | "checkbox"
  | "checkboxes"
  | "datepicker"
  | "dropdown"
  | "json"
  | "radio"
  | "slider"
  | "text"
  | "toggle";

/**
 * Schema definition for a single field.
 */
type FieldSchema = {
  type: FieldType;
  component: ComponentType;
  read_only?: boolean;
  precision?: number;
  range?: [number, number];
  values?: (string | number)[];
  classes?: string[];
};

/**
 * Schema definition for a collection of fields.
 */
type AnnotationSchema = Record<string, FieldSchema>;

type EmptyBody = Record<string, never>;

export type ActivateSchemaRequest = {
  fields?: string[];
};

export type ActivateSchemaResponse = EmptyBody;

export type CreateSchemaRequest = {
  field: string | string[];
  scan_samples?: boolean;
};

export type CreateSchemaResponse = {
  label_schema: AnnotationSchema;
};

export type DeactivateFieldsRequest = {
  fields?: string[];
};

export type DeactivateFieldsResponse = EmptyBody;

export type DeleteSchemaRequest = {
  fields?: string[];
};

export type DeleteSchemaResponse = EmptyBody;

export type ListSchemaRequest = EmptyBody;

export type ListSchemaResponse = {
  active_label_schemas: string[];
  label_schemas: Record<
    string,
    {
      default_label_schema: FieldSchema;
      read_only: boolean;
      type: string;
      unsupported: boolean;
      label_schema?: FieldSchema;
    }
  >;
};

export type SetActiveSchemaRequest = {
  fields?: string[];
};

export type SetActiveSchemaResponse = EmptyBody;

export type UpdateSchemRequest = {
  field: string;
  label_schema: FieldSchema;
};

export type UpdateSchemaResponse = {
  label_schema: FieldSchema;
};

export type ValidateSchemaRequest = {
  label_schemas?: AnnotationSchema;
};

export type ValidateSchemaResponse = {
  errors: string[];
};

/**
 * Public interface for interacting with annotation schema.
 */
export interface SchemaManager {
  /**
   * Activate a schema or list of schema, making it available for annotation.
   *
   * @param request Activation request
   */
  activateSchema: (
    request: ActivateSchemaRequest
  ) => Promise<ActivateSchemaResponse>;

  /**
   * Create a new schema or set of schema.
   * @param request
   */
  createSchema: (request: CreateSchemaRequest) => Promise<CreateSchemaResponse>;
  deactivateSchema: (
    request: DeactivateFieldsRequest
  ) => Promise<DeactivateFieldsResponse>;
  deleteSchema: (request: DeleteSchemaRequest) => Promise<DeleteSchemaResponse>;
  listSchema: (request: ListSchemaRequest) => Promise<ListSchemaResponse>;
  setActiveSchema: (
    request: SetActiveSchemaRequest
  ) => Promise<SetActiveSchemaResponse>;
  updateSchema: (request: UpdateSchemRequest) => Promise<UpdateSchemaResponse>;
  validateSchema: (
    request: ValidateSchemaRequest
  ) => Promise<ValidateSchemaResponse>;
}

type OperatorResponse<T> = {
  result: T;
  error?: string;
};

type OperatorCallback<T> = (response: OperatorResponse<T>) => void;

export const useSchemaManager = (): SchemaManager => {
  const operatorAsPromise = <T, R>(operator, request: T): Promise<R> => {
    return new Promise((resolve, reject) => {
      const operatorCallback: OperatorCallback<R> = (
        response: OperatorResponse<R>
      ) => {
        if (response.error) {
          reject(response.error);
        } else {
          resolve(response.result);
        }
      };

      operator.execute(request, { callback: operatorCallback });
    });
  };

  const activateSchemaOperator = useOperatorExecutor(
    "@voxel51/operators/activate_label_schemas"
  );
  const createSchemaOperator = useOperatorExecutor(
    "@voxel51/operators/generate_label_schemas"
  );
  const deactivateSchemaOperator = useOperatorExecutor(
    "@voxel51/operators/deactivate_label_schemas"
  );
  const deleteSchemaOperator = useOperatorExecutor(
    "@voxel51/operators/delete_label_schemas"
  );
  const listSchemaOperator = useOperatorExecutor(
    "@voxel51/operators/get_label_schemas"
  );
  const setActiveSchemaOperator = useOperatorExecutor(
    "@voxel51/operators/set_active_label_schemas"
  );
  const updateSchemaOperator = useOperatorExecutor(
    "@voxel51/operators/update_label_schema"
  );
  const validateSchemaOperator = useOperatorExecutor(
    "@voxel51/operators/validate_label_schemas"
  );

  const activateSchema = useCallback(
    (request: ActivateSchemaRequest): Promise<ActivateSchemaResponse> => {
      return operatorAsPromise(activateSchemaOperator, request);
    },
    [activateSchemaOperator]
  );

  const createSchema = useCallback(
    (request: CreateSchemaRequest): Promise<CreateSchemaResponse> => {
      return operatorAsPromise(createSchemaOperator, request);
    },
    [createSchemaOperator]
  );

  const deactivateSchema = useCallback(
    (request: DeactivateFieldsRequest): Promise<DeactivateFieldsResponse> => {
      return operatorAsPromise(deactivateSchemaOperator, request);
    },
    [deactivateSchemaOperator]
  );

  const deleteSchema = useCallback(
    (request: DeleteSchemaRequest): Promise<DeleteSchemaResponse> => {
      return operatorAsPromise(deleteSchemaOperator, request);
    },
    [deleteSchemaOperator]
  );

  const listSchema = useCallback(
    (request: ListSchemaRequest): Promise<ListSchemaResponse> => {
      return operatorAsPromise(listSchemaOperator, request);
    },
    [listSchemaOperator]
  );

  const setActiveSchema = useCallback(
    (request: SetActiveSchemaRequest): Promise<SetActiveSchemaResponse> => {
      return operatorAsPromise(setActiveSchemaOperator, request);
    },
    [setActiveSchemaOperator]
  );

  const updateSchema = useCallback(
    (request: UpdateSchemRequest): Promise<UpdateSchemaResponse> => {
      return operatorAsPromise(updateSchemaOperator, request);
    },
    [updateSchemaOperator]
  );

  const validateSchema = useCallback(
    (request: ValidateSchemaRequest): Promise<ValidateSchemaResponse> => {
      return operatorAsPromise(validateSchemaOperator, request);
    },
    [validateSchemaOperator]
  );

  return useMemo(
    () => ({
      activateSchema,
      createSchema,
      deactivateSchema,
      deleteSchema,
      listSchema,
      setActiveSchema,
      updateSchema,
      validateSchema,
    }),
    [
      activateSchema,
      createSchema,
      deactivateSchema,
      deleteSchema,
      listSchema,
      setActiveSchema,
      updateSchema,
      validateSchema,
    ]
  );
};
