/**
 * Add attribute card component using RichList item style.
 */

import {
  Clickable,
  Icon,
  IconName,
  Orientation,
  RichList,
  Size,
  Spacing,
  Stack,
} from "@voxel51/voodo";
import type { ListItemProps } from "@voxel51/voodo";
import { useState } from "react";
import {
  createDefaultFormData,
  getAttributeFormError,
  getAttributeNameError,
  toAttributeConfig,
  type AttributeConfig,
  type AttributeFormData,
} from "../../utils";
import AttributeFormContent from "./AttributeFormContent";

interface AddAttributeCardProps {
  existingAttributes: string[];
  onSave: (name: string, config: AttributeConfig) => void;
  onCancel: () => void;
}

const AddAttributeCard = ({
  existingAttributes,
  onSave,
  onCancel,
}: AddAttributeCardProps) => {
  const [formState, setFormState] = useState<AttributeFormData>(
    createDefaultFormData()
  );
  const [isDirty, setIsDirty] = useState(false);

  const nameError = getAttributeNameError(formState.name, existingAttributes);
  const formError = getAttributeFormError(formState);
  const showError = isDirty && nameError;
  const canSave = !nameError && !formError && formState.name.trim() !== "";

  const handleFormStateChange = (newState: AttributeFormData) => {
    setFormState(newState);
    if (!isDirty) setIsDirty(true);
  };

  const handleSave = () => {
    if (canSave) {
      onSave(formState.name.trim(), toAttributeConfig(formState));
    }
  };

  const listItem = {
    id: "__new_attribute__",
    data: {
      canSelect: false,
      canDrag: false,
      primaryContent: "New attribute",
      actions: (
        <Stack orientation={Orientation.Row} spacing={Spacing.Sm}>
          <Clickable onClick={onCancel} style={{ padding: 4 }}>
            <Icon name={IconName.Delete} size={Size.Md} />
          </Clickable>
          <Clickable
            onClick={handleSave}
            style={{
              padding: 4,
              opacity: canSave ? 1 : 0.5,
              cursor: canSave ? "pointer" : "not-allowed",
            }}
          >
            <Icon name={IconName.Check} size={Size.Md} />
          </Clickable>
        </Stack>
      ),
      additionalContent: (
        <AttributeFormContent
          formState={formState}
          onFormStateChange={handleFormStateChange}
          nameError={showError ? nameError : null}
        />
      ),
    } as ListItemProps,
  };

  return (
    <div style={{ marginBottom: "1rem" }}>
      <RichList listItems={[listItem]} draggable={false} />
    </div>
  );
};

export default AddAttributeCard;
