import {
  type AnnotationContextManager,
  type EnterResult,
  InitializationStatus,
  useSetEntranceLabel,
} from "@fiftyone/annotation";
import {
  type ContextManager,
  DefaultContextManager,
  useActiveModalFields,
  useModalSample,
  useQueryPerformanceSampleLimit,
  useUnboundStateRef,
} from "@fiftyone/state";
import { atom, useAtomValue } from "jotai";
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

// the contract (and the entrance-label state) live in @fiftyone/annotation;
// this module provides the app-layer implementation
export {
  type AnnotationContextManager,
  type EnterResult,
  InitializationStatus,
  useSetEntranceLabel,
} from "@fiftyone/annotation";

const contextManagerAtom = atom<ContextManager>(new DefaultContextManager());

/**
 * Hook which provides the {@link AnnotationContextManager} implementation.
 *
 * Register it for package-level consumers (the annotation controller) via
 * `useRegisterAnnotationContextManager` — see `SchemaManagerOutlet`.
 */
export const useAnnotationContextManager = (): AnnotationContextManager => {
  const contextManager = useAtomValue(contextManagerAtom);
  const setEntranceLabel = useSetEntranceLabel();
  const saveChanges = useSave();

  const [activeFields, setActiveFields] = useActiveModalFields();
  const { setLabelSchema, setActiveSchemaPaths } = useAnnotationSchemaContext();
  const sampleScanLimit = useQueryPerformanceSampleLimit();
  const canManageSchema = useCanManageSchema();
  const schemaResolver = useSchemaResolver();
  const { isPrimitive, setActivePrimitive } = usePrimitiveController();
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
      deactivateAllModesRef.current();
      contextManager.exit();
    }
  }, [contextManager, deactivateAllModesRef, saveChanges]);

  return useMemo(
    () => ({
      activateField,
      enter,
      exit,
    }),
    [activateField, enter, exit]
  );
};
