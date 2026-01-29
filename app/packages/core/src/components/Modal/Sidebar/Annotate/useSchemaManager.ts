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

export type ActivateSchemaRequest = {
  fields?: string[];
};

export type ActivateSchemaResponse = EmptyBody;

export type CreateSchemaRequest = {
  field: string | string[];
  scan_samples?: boolean;
};

export type CreateSchemaResponse = {
  label_schema: FieldSchema;
};

export type DeactivateSchemaRequest = {
  fields?: string[];
};

export type DeactivateSchemaResponse = EmptyBody;

export type DeleteSchemaRequest = {
  fields?: string[];
};

export type DeleteSchemaResponse = EmptyBody;

export type InitializeSchemaRequest = {
  field: string;
};

export type InitializeSchemaResponse = {
  label_schema: FieldSchema;
};

export type ListSchemaRequest = EmptyBody;

export type ListSchemaResponse = {
  active_label_schemas: string[];
  label_schemas: Record<string, LabelSchemaMeta>;
};

export type SetActiveSchemaRequest = {
  fields?: string[];
};

export type SetActiveSchemaResponse = EmptyBody;

export type UpdateSchemaRequest = {
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
   * Activate one or more schema, making them available for annotation.
   *
   * @param request Activation request
   */
  activateSchema: (
    request: ActivateSchemaRequest
  ) => Promise<ActivateSchemaResponse>;

  /**
   * Create one or more new schema.
   *
   * @param request Creation request
   */
  createSchema: (request: CreateSchemaRequest) => Promise<CreateSchemaResponse>;

  /**
   * Deactivate one or more schema, removing them from the annotation view.
   *
   * @param request Deactivation request
   */
  deactivateSchema: (
    request: DeactivateSchemaRequest
  ) => Promise<DeactivateSchemaResponse>;

  /**
   * Delete one or more schema, removing them from annotation management.
   *
   * @param request Deletion request
   */
  deleteSchema: (request: DeleteSchemaRequest) => Promise<DeleteSchemaResponse>;

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
  listSchema: (request: ListSchemaRequest) => Promise<ListSchemaResponse>;

  /**
   * Set the active schema.
   *
   * @param request Set request
   */
  setActiveSchema: (
    request: SetActiveSchemaRequest
  ) => Promise<SetActiveSchemaResponse>;

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
  validateSchema: (
    request: ValidateSchemaRequest
  ) => Promise<ValidateSchemaResponse>;
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
  const activateSchemaOperator = useOperatorExecutor(
    "@voxel51/operators/activate_label_schemas"
  ) as Operator<ActivateSchemaRequest, ActivateSchemaResponse>;
  const createSchemaOperator = useOperatorExecutor(
    "@voxel51/operators/generate_label_schemas"
  ) as Operator<CreateSchemaRequest, CreateSchemaResponse>;
  const deactivateSchemaOperator = useOperatorExecutor(
    "@voxel51/operators/deactivate_label_schemas"
  ) as Operator<DeactivateSchemaRequest, DeactivateSchemaResponse>;
  const deleteSchemaOperator = useOperatorExecutor(
    "@voxel51/operators/delete_label_schemas"
  ) as Operator<DeleteSchemaRequest, DeleteSchemaResponse>;
  const listSchemaOperator = useOperatorExecutor(
    "@voxel51/operators/get_label_schemas"
  ) as Operator<ListSchemaRequest, ListSchemaResponse>;
  const setActiveSchemaOperator = useOperatorExecutor(
    "@voxel51/operators/set_active_label_schemas"
  ) as Operator<SetActiveSchemaRequest, SetActiveSchemaResponse>;
  const updateSchemaOperator = useOperatorExecutor(
    "@voxel51/operators/update_label_schema"
  ) as Operator<UpdateSchemaRequest, UpdateSchemaResponse>;
  const validateSchemaOperator = useOperatorExecutor(
    "@voxel51/operators/validate_label_schemas"
  ) as Operator<ValidateSchemaRequest, ValidateSchemaResponse>;

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
    (request: DeactivateSchemaRequest): Promise<DeactivateSchemaResponse> => {
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
    (request: UpdateSchemaRequest): Promise<UpdateSchemaResponse> => {
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

  const initializeSchema = useCallback(
    async (
      request: InitializeSchemaRequest
    ): Promise<InitializeSchemaResponse> => {
      const createResponse = await createSchema({ field: request.field });
      const updateResponse = await updateSchema({
        field: request.field,
        label_schema: createResponse.label_schema,
      });

      return {
        label_schema: updateResponse.label_schema,
      };
    },
    [createSchema, updateSchema]
  );

  return useMemo(
    () => ({
      activateSchema,
      createSchema,
      deactivateSchema,
      deleteSchema,
      initializeSchema,
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
      initializeSchema,
      listSchema,
      setActiveSchema,
      updateSchema,
      validateSchema,
    ]
  );
};
