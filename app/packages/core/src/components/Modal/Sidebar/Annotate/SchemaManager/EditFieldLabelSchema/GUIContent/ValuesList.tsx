/**
 * Values list component for managing attribute values.
 */

import {
  Button,
  Icon,
  IconName,
  Input,
  RichList,
  Size,
  Text,
  TextColor,
  TextVariant,
  Variant,
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
        <Button
          variant={Variant.Icon}
          borderless
          onClick={() => handleDeleteValue(index)}
        >
          <Icon
            name={IconName.Delete}
            size={Size.Md}
            color="var(--color-content-text-secondary)"
          />
        </Button>
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
          color={TextColor.Primary}
        >
          Values
        </Text>
        <Button variant={Variant.Borderless} onClick={handleAddValue}>
          <Icon name={IconName.Add} size={Size.Sm} className="size-5" />
          <span>Add</span>
        </Button>
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
