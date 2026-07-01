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
   * Ensure a field's annotation schema exists on the server and is activated.
   *
   * This is non-destructive: existing schema state is preserved throughout
   * the async work and atomically swapped once the server responds.
   *
   * @param field The field name to initialize and activate
   */
  activateField: (field: string) => Promise<EnterResult>;

  /**
   * Enter annotation mode, performing any required setup for the specified `path`.
   *
   * If a {@link FieldSchema} does not exist for the specified `path`,
   * one will be created automatically. Existing schema and field visibility
   * state is preserved — the new field is added to the active set, not
   * substituted for it.
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
      const mgmtOps = jotaiStore.get(schemaManagementOpsAtom);

      if (!canManageSchema || !mgmtOps) {
        return {
          status: InitializationStatus.InsufficientPermissions,
        };
      }

      // Non-destructive: no synchronous clears of schema state.
      // Existing labelSchemasData / activeLabelSchemas stay intact
      // so useLabels and the canvas keep rendering throughout.
      try {
        let listSchemaResponse = await schemaResolver.listSchemas({});

        const hasSchema =
          !!listSchemaResponse.label_schemas[field]?.label_schema;
        const isAlreadyActive =
          listSchemaResponse.active_label_schemas.includes(field);

        // Fast path: the field is already provisioned and active on the
        // server. Skip the redundant initializeSchema/activateSchemas calls
        // to avoid clobbering the existing schema state.
        if (hasSchema && isAlreadyActive) {
          if (isPrimitive(field)) {
            setActivePrimitive(field);
          }

          return {
            status: InitializationStatus.Success,
          };
        }

        if (!hasSchema) {
          await mgmtOps.initializeSchema({
            field,
            scan_samples: true,
            limit: sampleScanLimit,
          });
        }

        await mgmtOps.activateSchemas({ fields: [field] });

        listSchemaResponse = await schemaResolver.listSchemas({});
        setLabelSchema(listSchemaResponse.label_schemas);
        setActiveSchemaPaths(listSchemaResponse.active_label_schemas);

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
      setActivePrimitive,
      setActiveSchemaPaths,
      setLabelSchema,
    ],
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
    ],
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
    [activateField, activeLabelId, enter, exit, setActiveLabelId],
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
