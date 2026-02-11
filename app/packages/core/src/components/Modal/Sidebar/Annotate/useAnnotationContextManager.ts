import { useSchemaManager } from "./useSchemaManager";
import { useCallback, useMemo } from "react";
import {
  type ContextManager,
  DefaultContextManager,
  useActiveModalFields,
  useQueryPerformanceSampleLimit,
} from "@fiftyone/state";
import useCanManageSchema from "./useCanManageSchema";
import { useAnnotationSchemaContext } from "./state";
import { atom, useAtom, useAtomValue } from "jotai";
import { KnownContexts, useCommandContext } from "@fiftyone/commands";
import useSave from "./Edit/useSave";
import { usePrimitiveController } from "./Edit/useActivePrimitive";

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
   * Enter annotation mode, performing any required setup for the specified `path`.
   *
   * If a {@link FieldSchema} does not exist for the specified `path`,
   * one will be created automatically.
   *
   * The modal's active paths will be updated to only include the specified `path`.
   *
   * If a `labelId` is provided,
   * that label instance will be opened for editing in the annotation sidebar.
   *
   * @param path The path to the sample field
   * @param labelId The ID of the active label
   */
  enter: (path?: string, labelId?: string) => Promise<EnterResult>;

  /**
   * Exit annotation mode, restoring the previous state in explore mode.
   *
   * Any active paths which were set before calling {@link enter} will be restored.
   */
  exit: () => void;

  /**
   * The label ID which triggered entrance into annotation.
   *
   * todo - this is required due to some chicken-and-egg behavior with renderer
   *  and label init; we should move all annotation init logic into this
   *  context manager and remove this.
   */
  entranceLabelId: string | null;

  /**
   * Clear the entrance label ID value.
   *
   * todo - this is required due to some chicken-and-egg behavior with renderer
   *  and label init; we should move all annotation init logic into this
   *  context manager and remove this.
   */
  clearEntranceLabelId: () => void;
}

const contextManagerAtom = atom<ContextManager>(new DefaultContextManager());
const activeLabelIdAtom = atom<string | null>(null);

/**
 * Hook which provides an {@link AnnotationContextManager}.
 */
export const useAnnotationContextManager = (): AnnotationContextManager => {
  const contextManager = useAtomValue(contextManagerAtom);
  const [activeLabelId, setActiveLabelId] = useAtom(activeLabelIdAtom);
  const saveChanges = useSave();

  const {
    activate: activateCommandContext,
    deactivate: deactivateCommandContext,
  } = useCommandContext(KnownContexts.ModalAnnotate, true);

  const [activeFields, setActiveFields] = useActiveModalFields();
  const { setLabelSchema, setActiveSchemaPaths } = useAnnotationSchemaContext();
  const schemaManager = useSchemaManager();
  const sampleScanLimit = useQueryPerformanceSampleLimit();
  const canManageSchema = useCanManageSchema();
  const { isPrimitive, setActivePrimitive } = usePrimitiveController();

  const initializeFieldSchema = useCallback(
    async (field: string) => {
      // activate only the specified field
      setActiveFields([field]);

      // clear annotation state
      setLabelSchema(null);
      setActiveSchemaPaths(null);

      // create and activate the field schema
      try {
        // check for existing schema
        let listSchemaResponse = await schemaManager.listSchemas({});

        // if it doesn't exist, create it
        if (!listSchemaResponse.label_schemas[field]?.label_schema) {
          if (!canManageSchema) {
            setLabelSchema(listSchemaResponse.label_schemas);
            return {
              status: InitializationStatus.InsufficientPermissions,
            };
          }

          await schemaManager.initializeSchema({
            field,
            scan_samples: true,
            limit: sampleScanLimit,
          });
        }

        if (canManageSchema) {
          await schemaManager.activateSchemas({ fields: [field] });
        }

        // refresh annotation state
        listSchemaResponse = await schemaManager.listSchemas({});
        setLabelSchema(listSchemaResponse.label_schemas);
        setActiveSchemaPaths(listSchemaResponse.active_label_schemas);

        return {
          status: InitializationStatus.Success,
        };
      } catch (error) {
        console.error(`Error initializing schema for field ${field}`, error);
        return {
          status: InitializationStatus.ServerError,
          message: error instanceof Error ? error.message : `${error}`,
        };
      }
    },
    [
      canManageSchema,
      sampleScanLimit,
      schemaManager,
      setActiveFields,
      setActiveSchemaPaths,
      setLabelSchema,
    ]
  );

  const enter = useCallback(
    async (field?: string, labelId?: string): Promise<EnterResult> => {
      // exit early if the context is already active
      if (contextManager.isActive()) {
        return {
          status: InitializationStatus.Success,
        };
      }

      // enter annotation context
      contextManager.enter();

      // activate command context
      activateCommandContext();

      // register callback to restore active fields on context exit
      contextManager.registerExitCallback({
        callback: () => setActiveFields(activeFields),
      });

      let result: EnterResult = {
        status: InitializationStatus.Success,
      };

      // initialize and activate field schema if specified
      if (field) {
        result = await initializeFieldSchema(field);

        // if the field is a primitive, activate it directly
        if (
          result.status === InitializationStatus.Success &&
          isPrimitive(field)
        ) {
          setActivePrimitive(field);
        }
      }

      if (labelId) {
        setActiveLabelId(labelId);
      }

      return result;
    },
    [
      activateCommandContext,
      activeFields,
      contextManager,
      initializeFieldSchema,
      isPrimitive,
      setActiveFields,
      setActiveLabelId,
      setActivePrimitive,
    ]
  );

  const exit = useCallback(() => {
    if (contextManager.isActive()) {
      saveChanges();
      deactivateCommandContext();
      contextManager.exit();
    }
  }, [contextManager, deactivateCommandContext, saveChanges]);

  return useMemo(
    () => ({
      clearEntranceLabelId: () => setActiveLabelId(null),
      enter,
      entranceLabelId: activeLabelId,
      exit,
    }),
    [activeLabelId, enter, exit, setActiveLabelId]
  );
};
