import { useQueryPerformanceSampleLimit } from "@fiftyone/state";
import { Button, Text, TextColor, TextVariant, Variant } from "@voxel51/voodo";
import React, { useCallback, useState } from "react";
import { useAnnotationSchemaContext } from "./state";
import useCanManageSchema from "./useCanManageSchema";
import type { RequiredField } from "./useMissingSourceField";
import { useSchemaManager } from "./useSchemaManager";

interface RequiredFieldPromptProps {
  requiredField: RequiredField;
}

const RequiredFieldPrompt = ({ requiredField }: RequiredFieldPromptProps) => {
  const canManage = useCanManageSchema();
  const schemaManager = useSchemaManager();
  const sampleScanLimit = useQueryPerformanceSampleLimit();
  const { setLabelSchema, setActiveSchemaPaths } = useAnnotationSchemaContext();
  const [activating, setActivating] = useState(false);

  const handleAddField = useCallback(async () => {
    setActivating(true);
    try {
      if (!requiredField.hasSchema) {
        await schemaManager.initializeSchema({
          field: requiredField.field,
          scan_samples: true,
          limit: sampleScanLimit,
        });
      }
      await schemaManager.activateSchemas({ fields: [requiredField.field] });
      const response = await schemaManager.listSchemas({});
      setLabelSchema(response.label_schemas);
      setActiveSchemaPaths(response.active_label_schemas);
    } catch (error) {
      console.error(
        `Error adding field "${requiredField.field}" to schema`,
        error
      );
    } finally {
      setActivating(false);
    }
  }, [
    requiredField,
    sampleScanLimit,
    schemaManager,
    setActiveSchemaPaths,
    setLabelSchema,
  ]);

  return (
    <>
      <Text variant={TextVariant.Xl} style={{ textAlign: "center" }}>
        Field not in label schema
      </Text>
      <Text
        color={TextColor.Secondary}
        variant={TextVariant.Md}
        style={{ textAlign: "center" }}
      >
        Add the <strong>{requiredField.field}</strong> field to active label
        schema to annotate in this view.
      </Text>
      <Button
        variant={Variant.Primary}
        data-cy="activate-field-schema"
        disabled={!canManage || activating}
        onClick={handleAddField}
      >
        {activating ? "Adding..." : `Add "${requiredField.field}" to schema`}
      </Button>
    </>
  );
};

export default RequiredFieldPrompt;
