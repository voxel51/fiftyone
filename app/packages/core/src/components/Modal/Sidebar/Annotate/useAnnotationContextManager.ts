import { useSchemaManager } from "./useSchemaManager";
import { useCallback, useMemo, useRef } from "react";
import { useActiveModalFields, useModalModeManager } from "@fiftyone/state";
import useCanManageSchema from "./useCanManageSchema";
import { useActiveLabelSchema, useLabelSchema } from "./state";

/**
 * Status code when attempting to initialize annotation schema.
 */
export enum InitializationStatus {
  InsufficientPermissions,
  ServerError,
  Success,
}

/**
 * Result type when attempting to enter annotation context.
 */
export type EnterResult = {
  status: InitializationStatus;
  message?: string;
};

/**
 * Manager which provides methods for stateful entry-into and exit-from annotation mode.
 */
export interface AnnotationContextManager {
  /**
   * Enter annotation mode, performing any required setup for the specified `field`.
   *
   * If a {@link FieldSchema} does not exist for the specified `field`,
   * one will be created automatically.
   *
   * The modal's active paths will be updated to only include the specified `field`.
   *
   * If a `labelId` is provided,
   * that label instance will be opened for editing in the annotation sidebar.
   *
   * @param field
   * @param labelId
   */
  enter: (field: string, labelId?: string) => Promise<EnterResult>;

  /**
   * Exit annotation mode, restoring the previous state in explore mode.
   *
   * Any active paths which were set before calling {@link enter} will be restored.
   */
  exit: () => void;
}

/**
 * Hook which provides an {@link AnnotationContextManager}.
 */
export const useAnnotationContextManager = (): AnnotationContextManager => {
  const [activeFields, setActiveFields] = useActiveModalFields();
  const [, setLabelSchema] = useLabelSchema();
  const [, setActiveLabelSchema] = useActiveLabelSchema();
  const modalModeManager = useModalModeManager();
  const schemaManager = useSchemaManager();
  const activeFieldsRef = useRef<string[]>([]);
  const { enabled: canManageSchema } = useCanManageSchema();

  const enter = useCallback(
    async (field: string, labelId?: string): Promise<EnterResult> => {
      // activate only the specified field
      activeFieldsRef.current = activeFields;
      setActiveFields([field]);

      // clear annotation state
      setLabelSchema(null);
      setActiveLabelSchema(null);

      // enter annotate mode
      modalModeManager.activateAnnotateMode();

      // create and activate the field schema
      try {
        // check for existing schema
        let listSchemaResponse = await schemaManager.listSchema({});

        // if it doesn't exist, create it
        if (!listSchemaResponse.label_schemas[field]?.label_schema) {
          if (!canManageSchema) {
            return {
              status: InitializationStatus.InsufficientPermissions,
            };
          }

          const createSchemaResponse = await schemaManager.createSchema({
            field,
          });
          await schemaManager.updateSchema({
            field,
            label_schema: createSchemaResponse.label_schema[field],
          });
        }

        await schemaManager.activateSchema({ fields: [field] });

        // refresh annotation state
        listSchemaResponse = await schemaManager.listSchema({});
        setLabelSchema(listSchemaResponse.label_schemas);
        setActiveLabelSchema(listSchemaResponse.active_label_schemas);
      } catch (error) {
        console.error(`Error initializing schema for field ${field}`, error);
        return {
          status: InitializationStatus.ServerError,
          message: error instanceof Error ? error.message : `${error}`,
        };
      }

      // edit the specific label if provided
      if (labelId) {
        // todo set active annotation label
      }

      return {
        status: InitializationStatus.Success,
      };
    },
    [
      activeFields,
      canManageSchema,
      modalModeManager,
      schemaManager,
      setActiveFields,
      setActiveLabelSchema,
      setLabelSchema,
    ]
  );

  const exit = useCallback(() => {
    modalModeManager.activateExploreMode();

    // restore previously-active fields
    setActiveFields(activeFieldsRef.current);
    activeFieldsRef.current = [];
  }, [modalModeManager, setActiveFields]);

  return useMemo(() => ({ enter, exit }), [enter, exit]);
};
