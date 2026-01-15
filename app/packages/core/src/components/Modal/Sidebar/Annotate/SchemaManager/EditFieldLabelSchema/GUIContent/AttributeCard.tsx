/**
 * Shared attribute card for add and edit modes.
 */

import { RichList } from "@voxel51/voodo";
import { createRichListItem, type AttributeFormState } from "../../utils";
import CardActions from "./CardActions";
import AttributeFormContent from "./SetAttribute";

type Mode = "add" | "edit";

interface AttributeCardProps {
  mode: Mode;
  formState: AttributeFormState;
  onFormStateChange: (state: AttributeFormState) => void;
  nameError: string | null;
  canSave: boolean;
  onSave: () => void;
  onCancel: () => void;
}

const AttributeCard = ({
  mode,
  formState,
  onFormStateChange,
  nameError,
  canSave,
  onSave,
  onCancel,
}: AttributeCardProps) => {
  const listItem = createRichListItem({
    id: mode === "add" ? "__new_attribute__" : formState.name,
    primaryContent: mode === "add" ? "New attribute" : "Edit attribute",
    actions: (
      <CardActions onDelete={onCancel} onSave={onSave} canSave={canSave} />
    ),
    additionalContent: (
      <AttributeFormContent
        formState={formState}
        onFormStateChange={onFormStateChange}
        nameError={nameError}
      />
    ),
  });

  return (
    <div style={{ marginBottom: mode === "add" ? "1rem" : undefined }}>
      <RichList listItems={[listItem]} draggable={false} />
    </div>
  );
};

export default AttributeCard;
