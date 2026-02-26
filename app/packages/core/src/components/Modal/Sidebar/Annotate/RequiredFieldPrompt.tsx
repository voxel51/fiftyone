import { useNotification } from "@fiftyone/state";
import { Button, Text, TextColor, TextVariant, Variant } from "@voxel51/voodo";
import React, { useCallback, useState } from "react";
import useCanManageSchema from "./useCanManageSchema";
import {
  InitializationStatus,
  useAnnotationContextManager,
} from "./useAnnotationContextManager";
import type { RequiredField } from "./useSourceFieldToActivate";

interface RequiredFieldPromptProps {
  requiredField: RequiredField;
}

const RequiredFieldPrompt = ({ requiredField }: RequiredFieldPromptProps) => {
  const canManage = useCanManageSchema();
  const contextManager = useAnnotationContextManager();
  const [activating, setActivating] = useState(false);
  const notify = useNotification();

  const handleAddField = useCallback(async () => {
    setActivating(true);
    const result = await contextManager.activateField(requiredField.field);
    setActivating(false);

    if (result.status !== InitializationStatus.Success) {
      notify({
        msg: `Failed to add "${requiredField.field}" to schema`,
        variant: "error",
      });
    }
  }, [requiredField, contextManager, notify]);

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
