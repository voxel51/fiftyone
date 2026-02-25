import { useQueryPerformanceSampleLimit } from "@fiftyone/state";
import { useCallback } from "react";
import { useAnnotationSchemaContext } from "./state";
import useCanManageSchema from "./useCanManageSchema";
import { useSchemaManager } from "./useSchemaManager";

export enum InitializationStatus {
  InsufficientPermissions,
  ServerError,
  Success,
}

export type InitializationResult = {
  status: InitializationStatus;
  message?: string;
};

/**
 * Hook that returns a function to initialize and activate a field's annotation schema.
 */
export default function useInitializeFieldSchema() {
  const { setLabelSchema, setActiveSchemaPaths } = useAnnotationSchemaContext();
  const schemaManager = useSchemaManager();
  const sampleScanLimit = useQueryPerformanceSampleLimit();
  const canManageSchema = useCanManageSchema();

  return useCallback(
    async (field: string): Promise<InitializationResult> => {
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

        return { status: InitializationStatus.Success };
      } catch (error) {
        console.error(`Error initializing schema for field "${field}"`, error);
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
      setActiveSchemaPaths,
      setLabelSchema,
    ]
  );
}
