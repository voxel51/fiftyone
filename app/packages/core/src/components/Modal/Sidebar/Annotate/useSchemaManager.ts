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
export type AnnotationSchema = Record<string, FieldSchema>;

/**
 * Descriptor of a label schema containing additional metadata.
 */
export type LabelSchemaMeta = {
  default_label_schema: FieldSchema;
  read_only: boolean;
  type: string;
  unsupported: boolean;
  label_schema?: FieldSchema;
};

type EmptyBody = Record<string, never>;

export type ActivateSchemasRequest = {
  fields?: string[];
};

export type ActivateSchemasResponse = EmptyBody;

export type CreateSchemasRequest = {
  field: string | string[];
  scan_samples?: boolean;
};

export type CreateSchemasResponse = {
  label_schema: FieldSchema;
};

export type DeactivateSchemasRequest = {
  fields?: string[];
};

export type DeactivateSchemasResponse = EmptyBody;

export type DeleteSchemasRequest = {
  fields?: string[];
};

export type DeleteSchemasResponse = EmptyBody;

export type InitializeSchemaRequest = {
  field: string;
};

export type InitializeSchemaResponse = {
  label_schema: FieldSchema;
};

export type ListSchemasRequest = EmptyBody;

export type ListSchemasResponse = {
  active_label_schemas: string[];
  label_schemas: Record<string, LabelSchemaMeta>;
};

export type SetActiveSchemasRequest = {
  fields?: string[];
};

export type SetActiveSchemasResponse = EmptyBody;

export type UpdateSchemaRequest = {
  field: string;
  label_schema: FieldSchema;
};

export type UpdateSchemaResponse = {
  label_schema: FieldSchema;
};

export type ValidateSchemasRequest = {
  label_schemas?: AnnotationSchema;
};

export type ValidateSchemasResponse = {
  errors: string[];
};

/**
 * Public interface for interacting with annotation schema.
 */
export interface SchemaManager {
  /**
   * Activate one or more schema, making them available for annotation.
   *
   * @param request Activation request
   */
  activateSchemas: (
    request: ActivateSchemasRequest
  ) => Promise<ActivateSchemasResponse>;

  /**
   * Create one or more new schema.
   *
   * @param request Creation request
   */
  createSchemas: (
    request: CreateSchemasRequest
  ) => Promise<CreateSchemasResponse>;

  /**
   * Deactivate one or more schema, removing them from the annotation view.
   *
   * @param request Deactivation request
   */
  deactivateSchemas: (
    request: DeactivateSchemasRequest
  ) => Promise<DeactivateSchemasResponse>;

  /**
   * Delete one or more schema, removing them from annotation management.
   *
   * @param request Deletion request
   */
  deleteSchemas: (
    request: DeleteSchemasRequest
  ) => Promise<DeleteSchemasResponse>;

  /**
   * Initialize the schema for a field.
   *
   * This method will create and persist a new schema for the specified field.
   *
   * @param request Initialization request
   */
  initializeSchema: (
    request: InitializeSchemaRequest
  ) => Promise<InitializeSchemaResponse>;

  /**
   * List the available schema.
   *
   * @param request List request
   */
  listSchemas: (request: ListSchemasRequest) => Promise<ListSchemasResponse>;

  /**
   * Set the active schema.
   *
   * @param request Set request
   */
  setActiveSchemas: (
    request: SetActiveSchemasRequest
  ) => Promise<SetActiveSchemasResponse>;

  /**
   * Update one or more schema definitions.
   *
   * @param request Update request
   */
  updateSchema: (request: UpdateSchemaRequest) => Promise<UpdateSchemaResponse>;

  /**
   * Validate one or more schema.
   *
   * @param request Validation request
   */
  validateSchemas: (
    request: ValidateSchemasRequest
  ) => Promise<ValidateSchemasResponse>;
}

/**
 * Data type representing an operator's execution response.
 */
type OperatorResponse<T> = {
  result: T;
  error?: string;
};

/**
 * Type representing a callback method to be invoked when an operator completes
 * execution.
 */
type OperatorCallback<T> = (response: OperatorResponse<T>) => void;

/**
 * Type representing an operator.
 *
 * This type is an incomplete definition and exists for type-safety of
 * logic in this file.
 */
type Operator<T, R> = {
  execute: (request: T, options: { callback?: OperatorCallback<R> }) => void;
};

/**
 * Convert an operator's execution into a `Promise`.
 *
 * This method will invoke the provided operator using the provided request
 * object. The returned promise will resolve once execution is complete
 * and a result is available.
 *
 * @param operator Operator to execute
 * @param request Request body
 */
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

/**
 * Hook which provides a valid {@link SchemaManager} instance.
 */
export const useSchemaManager = (): SchemaManager => {
  const activateSchemasOperator = useOperatorExecutor(
    "@voxel51/operators/activate_label_schemas"
  ) as Operator<ActivateSchemasRequest, ActivateSchemasResponse>;
  const createSchemasOperator = useOperatorExecutor(
    "@voxel51/operators/generate_label_schemas"
  ) as Operator<CreateSchemasRequest, CreateSchemasResponse>;
  const deactivateSchemasOperator = useOperatorExecutor(
    "@voxel51/operators/deactivate_label_schemas"
  ) as Operator<DeactivateSchemasRequest, DeactivateSchemasResponse>;
  const deleteSchemasOperator = useOperatorExecutor(
    "@voxel51/operators/delete_label_schemas"
  ) as Operator<DeleteSchemasRequest, DeleteSchemasResponse>;
  const listSchemasOperator = useOperatorExecutor(
    "@voxel51/operators/get_label_schemas"
  ) as Operator<ListSchemasRequest, ListSchemasResponse>;
  const setActiveSchemasOperator = useOperatorExecutor(
    "@voxel51/operators/set_active_label_schemas"
  ) as Operator<SetActiveSchemasRequest, SetActiveSchemasResponse>;
  const updateSchemaOperator = useOperatorExecutor(
    "@voxel51/operators/update_label_schema"
  ) as Operator<UpdateSchemaRequest, UpdateSchemaResponse>;
  const validateSchemasOperator = useOperatorExecutor(
    "@voxel51/operators/validate_label_schemas"
  ) as Operator<ValidateSchemasRequest, ValidateSchemasResponse>;

  const activateSchemas = useCallback(
    (request: ActivateSchemasRequest): Promise<ActivateSchemasResponse> => {
      return operatorAsPromise(activateSchemasOperator, request);
    },
    [activateSchemasOperator]
  );

  const createSchemas = useCallback(
    (request: CreateSchemasRequest): Promise<CreateSchemasResponse> => {
      return operatorAsPromise(createSchemasOperator, request);
    },
    [createSchemasOperator]
  );

  const deactivateSchema = useCallback(
    (request: DeactivateSchemasRequest): Promise<DeactivateSchemasResponse> => {
      return operatorAsPromise(deactivateSchemasOperator, request);
    },
    [deactivateSchemasOperator]
  );

  const deleteSchemas = useCallback(
    (request: DeleteSchemasRequest): Promise<DeleteSchemasResponse> => {
      return operatorAsPromise(deleteSchemasOperator, request);
    },
    [deleteSchemasOperator]
  );

  const listSchemas = useCallback(
    (request: ListSchemasRequest): Promise<ListSchemasResponse> => {
      return operatorAsPromise(listSchemasOperator, request);
    },
    [listSchemasOperator]
  );

  const setActiveSchemas = useCallback(
    (request: SetActiveSchemasRequest): Promise<SetActiveSchemasResponse> => {
      return operatorAsPromise(setActiveSchemasOperator, request);
    },
    [setActiveSchemasOperator]
  );

  const updateSchema = useCallback(
    (request: UpdateSchemaRequest): Promise<UpdateSchemaResponse> => {
      return operatorAsPromise(updateSchemaOperator, request);
    },
    [updateSchemaOperator]
  );

  const validateSchemas = useCallback(
    (request: ValidateSchemasRequest): Promise<ValidateSchemasResponse> => {
      return operatorAsPromise(validateSchemasOperator, request);
    },
    [validateSchemasOperator]
  );

  const initializeSchema = useCallback(
    async (
      request: InitializeSchemaRequest
    ): Promise<InitializeSchemaResponse> => {
      const createResponse = await createSchemas({ field: request.field });
      const updateResponse = await updateSchema({
        field: request.field,
        label_schema: createResponse.label_schema,
      });

      return {
        label_schema: updateResponse.label_schema,
      };
    },
    [createSchemas, updateSchema]
  );

  return useMemo(
    () => ({
      activateSchemas: activateSchemas,
      createSchemas: createSchemas,
      deactivateSchemas: deactivateSchema,
      deleteSchemas: deleteSchemas,
      initializeSchema,
      listSchemas: listSchemas,
      setActiveSchemas: setActiveSchemas,
      updateSchema,
      validateSchemas: validateSchemas,
    }),
    [
      activateSchemas,
      createSchemas,
      deactivateSchema,
      deleteSchemas,
      initializeSchema,
      listSchemas,
      setActiveSchemas,
      updateSchema,
      validateSchemas,
    ]
  );
};
