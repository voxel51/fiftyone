/**
 * Values list component for managing attribute values.
 */

import {
  Align,
  Button,
  FormField,
  Icon,
  IconName,
  Input,
  Justify,
  Orientation,
  RichList,
  Size,
  Spacing,
  Stack,
  Text,
  TextColor,
  textColorClass,
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
  readOnly?: boolean;
  subtitle?: string;
}

const ValuesList = ({
  values,
  onValuesChange,
  isNumeric = false,
  isInteger = false,
  error = null,
  largeLabels = false,
  readOnly = false,
  subtitle,
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
      canDrag: !readOnly,
      primaryContent: value,
      actions: readOnly ? undefined : (
        <Button
          variant={Variant.Icon}
          borderless
          onClick={() => handleDeleteValue(index)}
        >
          <Icon
            name={IconName.Delete}
            size={Size.Md}
            className={textColorClass(TextColor.Secondary)}
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
    <Stack orientation={Orientation.Column} spacing={Spacing.Sm}>
      <Stack orientation={Orientation.Column} spacing={Spacing.None}>
        <Stack
          orientation={Orientation.Row}
          justify={Justify.Between}
          align={Align.Center}
        >
          <Text
            variant={largeLabels ? TextVariant.Lg : TextVariant.Md}
            color={TextColor.Primary}
          >
            Values
          </Text>
          {!readOnly && (
            <Button
              variant={Variant.Borderless}
              onClick={handleAddValue}
              leadingIcon={() => (
                <Icon name={IconName.Add} size={Size.Sm} className="size-5" />
              )}
            >
              Add
            </Button>
          )}
        </Stack>
        {subtitle && (
          <Text variant={TextVariant.Sm} color={TextColor.Secondary}>
            {subtitle}
          </Text>
        )}
      </Stack>
      {!readOnly && (
        <FormField
          control={
            <Input
              type={isNumeric ? "number" : "text"}
              value={newValue}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              placeholder={isNumeric ? "Enter a number" : "Enter a value"}
              error={!!inputError}
            />
          }
          error={inputError ?? undefined}
        />
      )}
      {values.length > 0 && (
        <RichList
          listItems={valueListItems}
          draggable={!readOnly}
          onOrderChange={readOnly ? undefined : handleOrderChange}
        />
      )}
      {error && (
        <Text variant={TextVariant.Sm} color={TextColor.Destructive}>
          {error}
        </Text>
      )}
    </Stack>
  );
};

export default ValuesList;
