import { useSampleMutationManager } from "@fiftyone/annotation";
import {
  type ContextManager,
  DefaultContextManager,
  useActiveModalFields,
  useQueryPerformanceSampleLimit,
  useUnboundStateRef,
} from "@fiftyone/state";
import { atom, useAtom, useAtomValue, useSetAtom } from "jotai";
import { jotaiStore } from "@fiftyone/state/src/jotai";
import { useCallback, useMemo } from "react";
import { usePrimitiveController } from "./Edit/useActivePrimitive";
import useSave from "./Edit/useSave";
import { useAnnotationSchemaContext } from "./state";
import useCanManageSchema from "./useCanManageSchema";
import { useDeactivateAllModes } from "./useDeactivateAllModes";
import {
  schemaManagementOpsAtom,
  useSchemaResolver,
} from "./useSchemaResolver";

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
   * Initialize and activate a field's annotation schema within an
   * already-active annotation context.
   *
   * Use this when the annotation context is already entered (e.g. the
   * Annotate tab is mounted) and you need to activate a specific field.
   *
   * @param field The field name to initialize and activate
   */
  activateField: (field: string) => Promise<EnterResult>;

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

  const [activeFields, setActiveFields] = useActiveModalFields();
  const { setLabelSchema, setActiveSchemaPaths } = useAnnotationSchemaContext();
  const sampleScanLimit = useQueryPerformanceSampleLimit();
  const canManageSchema = useCanManageSchema();
  const schemaResolver = useSchemaResolver();
  const { isPrimitive, setActivePrimitive } = usePrimitiveController();
  const { reset: clearStaleMutations } = useSampleMutationManager();
  // Held in a ref so exit() invokes the most recent deactivator chain
  // even when the captured `exit` closure was snapshotted at mount.
  const deactivateAllModesRef = useUnboundStateRef(useDeactivateAllModes());

  const activateField = useCallback(
    async (field: string): Promise<EnterResult> => {
      // Read management ops from the store at execution time to avoid
      // stale closure — the atom may be set by SchemaManagementProvider's
      // effect after this callback was created.
      const mgmtOps = jotaiStore.get(schemaManagementOpsAtom);

      if (!canManageSchema || !mgmtOps) {
        return {
          status: InitializationStatus.InsufficientPermissions,
        };
      }

      // activate only the specified field
      setActiveFields([field]);

      // clear annotation state
      setLabelSchema(null);
      setActiveSchemaPaths(null);

      // create and activate the field schema
      try {
        // check for existing schema
        let listSchemaResponse = await schemaResolver.listSchemas({});

        // if it doesn't exist, create it
        if (!listSchemaResponse.label_schemas[field]?.label_schema) {
          await mgmtOps.initializeSchema({
            field,
            scan_samples: true,
            limit: sampleScanLimit,
          });
        }

        await mgmtOps.activateSchemas({ fields: [field] });

        // refresh annotation state
        listSchemaResponse = await schemaResolver.listSchemas({});
        setLabelSchema(listSchemaResponse.label_schemas);
        setActiveSchemaPaths(listSchemaResponse.active_label_schemas);

        // if the field is a primitive, activate it directly
        if (isPrimitive(field)) {
          setActivePrimitive(field);
        }

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
      isPrimitive,
      sampleScanLimit,
      schemaResolver,
      setActiveFields,
      setActivePrimitive,
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

      // register callback to restore active fields on context exit
      contextManager.registerExitCallback({
        callback: () => setActiveFields(activeFields),
      });

      let result: EnterResult = {
        status: InitializationStatus.Success,
      };

      // initialize and activate field schema if specified
      if (field) {
        result = await activateField(field);
      }

      if (labelId) {
        setActiveLabelId(labelId);
      }

      return result;
    },
    [
      activateField,
      activeFields,
      contextManager,
      setActiveFields,
      setActiveLabelId,
    ]
  );

  const exit = useCallback(() => {
    if (contextManager.isActive()) {
      saveChanges();
      clearStaleMutations();
      deactivateAllModesRef.current();
      contextManager.exit();
    }
  }, [clearStaleMutations, contextManager, deactivateAllModesRef, saveChanges]);

  return useMemo(
    () => ({
      activateField,
      clearEntranceLabelId: () => setActiveLabelId(null),
      enter,
      entranceLabelId: activeLabelId,
      exit,
    }),
    [activateField, activeLabelId, enter, exit, setActiveLabelId]
  );
};

/**
 * Hook that returns a setter for the entrance label ID.
 *
 * Use this to request that a label be activated for editing once its overlay
 * is ready in the scene. This integrates with
 * {@link useRegisterRendererEventHandlers} which handles the actual overlay
 * selection, avoiding race conditions with scene/overlay initialization.
 */
export const useSetActiveLabelId = () => useSetAtom(activeLabelIdAtom);
