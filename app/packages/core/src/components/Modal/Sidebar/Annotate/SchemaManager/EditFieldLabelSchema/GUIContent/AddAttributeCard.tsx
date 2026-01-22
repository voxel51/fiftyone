/**
 * Add attribute card component.
 * Uses the shared AttributeCard for rendering.
 */

import { useState } from "react";
import {
  createDefaultFormData,
  getAttributeFormError,
  getAttributeNameError,
  toAttributeConfig,
  type AttributeConfig,
  type AttributeFormData,
} from "../../utils";
import AttributeCard from "./AttributeCard";

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

  return (
    <AttributeCard
      id="__new_attribute__"
      title="New attribute"
      formState={formState}
      onFormStateChange={handleFormStateChange}
      nameError={showError ? nameError : null}
      canSave={canSave}
      onSave={handleSave}
      onCancel={onCancel}
    />
  );
};

export default AddAttributeCard;
