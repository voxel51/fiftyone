/**
 * Add class card component using RichList item style.
 */

import {
  Checkbox,
  Input,
  Orientation,
  RichList,
  Size,
  Spacing,
  Stack,
  Text,
  TextColor,
  TextVariant,
} from "@voxel51/voodo";
import React, { useState } from "react";
import { createRichListItem, getClassNameError } from "../../utils";
import CardActions from "./CardActions";

interface AddClassCardProps {
  attributeCount: number;
  existingClasses: string[];
  onSave: (name: string) => void;
  onCancel: () => void;
}

const AddClassCard = ({
  attributeCount,
  existingClasses,
  onSave,
  onCancel,
}: AddClassCardProps) => {
  const [name, setName] = useState("");
  const [isDirty, setIsDirty] = useState(false);

  const error = getClassNameError(name, existingClasses);
  const showError = isDirty && error;
  const canSave = !error;

  const handleSave = () => {
    if (canSave) {
      onSave(name.trim());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && canSave) {
      e.preventDefault();
      handleSave();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setName(e.target.value);
    if (!isDirty) setIsDirty(true);
  };

  const listItem = createRichListItem({
    id: "__new__",
    primaryContent: "New class",
    actions: (
      <CardActions onCancel={onCancel} onSave={handleSave} canSave={canSave} />
    ),
    additionalContent: (
      <Stack orientation={Orientation.Column} spacing={Spacing.Md}>
        <div>
          <Input
            value={name}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="Class name"
            error={!!showError}
            autoFocus
          />
          {showError && (
            <Text
              variant={TextVariant.Md}
              color={TextColor.Destructive}
              style={{ marginTop: 4 }}
            >
              {error}
            </Text>
          )}
        </div>
        {/* // TODO: Implement this with per-class attributes in the future
        <Stack
          orientation={Orientation.Row}
          spacing={Spacing.Sm}
          style={{ alignItems: "center" }}
        >
          <Checkbox size={Size.Md} checked={true} disabled />
          <Text variant={TextVariant.Md} color={TextColor.Secondary}>
            Include all {attributeCount} attributes
          </Text>
        </Stack> */}
      </Stack>
    ),
  });

  return (
    <div style={{ marginBottom: "1rem" }}>
      <RichList listItems={[listItem]} draggable={false} />
    </div>
  );
};

export default AddClassCard;
