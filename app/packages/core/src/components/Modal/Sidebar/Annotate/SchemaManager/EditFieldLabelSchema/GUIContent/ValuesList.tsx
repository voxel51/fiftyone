/**
 * Values list component for managing attribute values.
 */

import {
  Clickable,
  Icon,
  IconName,
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
import {
  createRichListItem,
  validateSingleValue,
  type RichListItem,
} from "../../utils";

interface ValuesListProps {
  values: string[];
  onValuesChange: (values: string[]) => void;
  isNumeric?: boolean;
  isInteger?: boolean;
  /** Validation error from parent (e.g., "At least one value is required") */
  error?: string | null;
  /** Use larger, primary-colored labels */
  largeLabels?: boolean;
}

const ValuesList = ({
  values,
  onValuesChange,
  isNumeric = false,
  isInteger = false,
  error = null,
  largeLabels = false,
}: ValuesListProps) => {
  const [newValue, setNewValue] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);

  const validateValue = (val: string): string | null => {
    if (!val.trim()) return null;
    if (isNumeric) {
      const num = parseFloat(val);
      if (isNaN(num)) return "Must be a number";
      if (isInteger && !Number.isInteger(num)) return "Must be an integer";
    }
    if (values.includes(val.trim())) return "Value already exists";
    return null;
  };

  const handleAddValue = () => {
    const trimmed = newValue.trim();
    const validationError = validateSingleValue(
      trimmed,
      values,
      isNumeric,
      isInteger
    );

    if (validationError) {
      setInputError(validationError);
      return;
    }
    if (trimmed) {
      onValuesChange([...values, trimmed]);
      setNewValue("");
      setInputError(null);
    }
  };

  const handleDeleteValue = (index: number) => {
    onValuesChange(values.filter((_, i) => i !== index));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddValue();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewValue(e.target.value);
    setInputError(null);
  };

  const valueListItems = values.map((value, index) =>
    createRichListItem({
      id: `value-${index}`,
      canDrag: true,
      primaryContent: value,
      actions: (
        <Clickable onClick={() => handleDeleteValue(index)}>
          <Icon name={IconName.Delete} size={Size.Md} />
        </Clickable>
      ),
    })
  );

  const handleOrderChange = (newItems: RichListItem[]) => {
    const newValues = newItems.map(
      (item) => item.data.primaryContent as string
    );
    onValuesChange(newValues);
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "0.5rem",
        }}
      >
        <Text
          variant={largeLabels ? TextVariant.Lg : TextVariant.Md}
          color={largeLabels ? TextColor.Primary : TextColor.Secondary}
        >
          Values
        </Text>
        <Clickable onClick={handleAddValue}>
          <Stack
            orientation={Orientation.Row}
            spacing={Spacing.Xs}
            style={{ alignItems: "center" }}
          >
            <Icon name={IconName.Add} size={Size.Sm} />
            <Text variant={TextVariant.Sm}>Add</Text>
          </Stack>
        </Clickable>
      </div>
      <Input
        type={isNumeric ? "number" : "text"}
        value={newValue}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={isNumeric ? "Enter a number" : "Enter a value"}
        error={!!inputError}
      />
      {inputError && (
        <Text
          variant={TextVariant.Sm}
          color={TextColor.Destructive}
          style={{ marginTop: 4 }}
        >
          {inputError}
        </Text>
      )}
      {values.length > 0 && (
        <div style={{ marginTop: "0.5rem" }}>
          <RichList
            listItems={valueListItems}
            draggable={true}
            onOrderChange={handleOrderChange}
          />
        </div>
      )}
      {error && (
        <Text
          variant={TextVariant.Sm}
          color={TextColor.Destructive}
          style={{ marginTop: 4 }}
        >
          {error}
        </Text>
      )}
    </div>
  );
};

export default ValuesList;
