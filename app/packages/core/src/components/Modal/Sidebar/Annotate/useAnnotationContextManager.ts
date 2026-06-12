import { useSampleInstance, type LabelRef } from "@fiftyone/annotation";
import {
  type ContextManager,
  DefaultContextManager,
  useActiveModalFields,
  useModalSample,
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
   * The label which triggered entrance into annotation — a complete engine
   * ref captured at the dispatch site (explicit payload — consumers never
   * resolve identity from ambient state).
   *
   * todo - this is required due to some chicken-and-egg behavior with renderer
   *  and label init; we should move all annotation init logic into this
   *  context manager and remove this.
   */
  entranceLabel: LabelRef | null;

  /**
   * Clear the entrance label value.
   *
   * todo - this is required due to some chicken-and-egg behavior with renderer
   *  and label init; we should move all annotation init logic into this
   *  context manager and remove this.
   */
  clearEntranceLabel: () => void;
}

const contextManagerAtom = atom<ContextManager>(new DefaultContextManager());

/**
 * The entrance label: which label should open for editing on annotate entry.
 * A complete engine ref, captured at the dispatch site — consumers apply it
 * verbatim, never resolving identity from ambient state.
 */
const entranceLabelAtom = atom<LabelRef | null>(null);

/**
 * Hook which provides an {@link AnnotationContextManager}.
 */
export const useAnnotationContextManager = (): AnnotationContextManager => {
  const contextManager = useAtomValue(contextManagerAtom);
  const [entranceLabel, setEntranceLabel] = useAtom(entranceLabelAtom);
  const saveChanges = useSave();

  const [activeFields, setActiveFields] = useActiveModalFields();
  const { setLabelSchema, setActiveSchemaPaths } = useAnnotationSchemaContext();
  const sampleScanLimit = useQueryPerformanceSampleLimit();
  const canManageSchema = useCanManageSchema();
  const schemaResolver = useSchemaResolver();
  const { isPrimitive, setActivePrimitive } = usePrimitiveController();
  const sample = useSampleInstance();
  // the modal's sample id — the same id the engine's store registers
  // under; the store itself isn't registered yet on explore-tab entry
  const modalSampleId = useModalSample()?.sample?._id;
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

      // the entrance payload is a complete ref captured here at the
      // dispatch site — consumers apply what they were told
      if (labelId && field && modalSampleId) {
        setEntranceLabel({
          sample: modalSampleId,
          path: field,
          instanceId: labelId,
        });
      }

      return result;
    },
    [
      activateField,
      activeFields,
      contextManager,
      modalSampleId,
      setActiveFields,
      setEntranceLabel,
    ]
  );

  const exit = useCallback(() => {
    if (contextManager.isActive()) {
      saveChanges();
      sample.clear();
      deactivateAllModesRef.current();
      contextManager.exit();
    }
  }, [contextManager, deactivateAllModesRef, sample, saveChanges]);

  return useMemo(
    () => ({
      activateField,
      clearEntranceLabel: () => setEntranceLabel(null),
      enter,
      entranceLabel,
      exit,
    }),
    [activateField, enter, entranceLabel, exit, setEntranceLabel]
  );
};

/**
 * Hook that returns a setter for the entrance label.
 *
 * Use this to request that a label open for editing on annotate entry. The
 * payload carries the field path captured at the dispatch site; consumers
 * ({@link useRegisterRendererEventHandlers}) apply it to the engine anchor
 * once the engine knows the label.
 */
export const useSetEntranceLabel = () => useSetAtom(entranceLabelAtom);
