import { useSchemaManager } from "./useSchemaManager";
import { useCallback, useEffect, useMemo } from "react";
import {
  type ContextManager,
  DefaultContextManager,
  useActiveModalFields,
} from "@fiftyone/state";
import useCanManageSchema from "./useCanManageSchema";
import { useActiveLabelSchema, useLabelSchema } from "./state";
import { useLighter } from "@fiftyone/lighter";
import { atom, useAtom, useAtomValue } from "jotai";

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
}

const activeLabelIdAtom = atom<string | null>(null);
const contextManagerAtom = atom<ContextManager>(new DefaultContextManager());

/**
 * Hook which provides an {@link AnnotationContextManager}.
 */
export const useAnnotationContextManager = (): AnnotationContextManager => {
  const contextManager = useAtomValue(contextManagerAtom);
  const [activeLabelId, setActiveLabelId] = useAtom(activeLabelIdAtom);

  const [activeFields, setActiveFields] = useActiveModalFields();
  const [, setLabelSchema] = useLabelSchema();
  const [, setActiveLabelSchema] = useActiveLabelSchema();
  const schemaManager = useSchemaManager();
  const { enabled: canManageSchema } = useCanManageSchema();
  const { scene } = useLighter();

  const targetOverlay = activeLabelId
    ? scene
        ?.getAllOverlays()
        ?.find(
          (overlay) =>
            overlay.id === activeLabelId || overlay.label?._id === activeLabelId
        )
    : null;

  useEffect(() => {
    if (scene && targetOverlay) {
      scene.selectOverlay(targetOverlay.id);
      setActiveLabelId(null);
    }
  }, [scene, targetOverlay]);

  const initializeFieldSchema = useCallback(
    async (field?: string, labelId?: string) => {
      // activate only the specified field
      setActiveFields([field]);

      // clear annotation state
      setLabelSchema(null);
      setActiveLabelSchema(null);

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

        // set active label ID to trigger selection
        setActiveLabelId(labelId);

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
      schemaManager,
      setActiveFields,
      setActiveLabelId,
      setActiveLabelSchema,
      setLabelSchema,
    ]
  );

  const enter = useCallback(
    async (field?: string, labelId?: string): Promise<EnterResult> => {
      // enter annotation context
      contextManager.enter();

      // register callback to restore active fields on context exit
      contextManager.registerExitCallback({
        callback: () => setActiveFields(activeFields),
      });

      // initialize and activate field schema if specified
      if (field) {
        return initializeFieldSchema(field, labelId);
      }

      return {
        status: InitializationStatus.Success,
      };
    },
    [activeFields, contextManager, initializeFieldSchema, setActiveFields]
  );

  const exit = useCallback(() => {
    contextManager.exit();
  }, [contextManager]);

  return useMemo(() => ({ enter, exit }), [enter, exit]);
};
