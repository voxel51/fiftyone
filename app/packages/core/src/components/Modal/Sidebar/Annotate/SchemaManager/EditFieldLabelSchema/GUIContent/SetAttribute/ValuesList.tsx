/**
 * Values list component for attribute editing.
 */

import {
  Clickable,
  Icon,
  IconName,
  Input,
  RichList,
  Size,
  Text,
  TextColor,
  TextVariant,
} from "@voxel51/voodo";
import React, { useState } from "react";
import { FormFieldRow, FormSectionHeader } from "../../../styled";
import { createRichListItem, type RichListItem } from "../../../utils";

interface ValuesListProps {
  values: string[];
  onValuesChange: (values: string[]) => void;
  isNumeric?: boolean;
}

const ValuesList = ({
  values,
  onValuesChange,
  isNumeric = false,
}: ValuesListProps) => {
  const [newValue, setNewValue] = useState("");

  const handleAddValue = () => {
    const trimmed = newValue.trim();
    if (trimmed && !values.includes(trimmed)) {
      onValuesChange([...values, trimmed]);
      setNewValue("");
    }
  };

  const handleDeleteValue = (index: number) => {
    const newValues = values.filter((_, i) => i !== index);
    onValuesChange(newValues);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddValue();
    }
  };

  const valueListItems = values.map((value, index) =>
    createRichListItem({
      id: `values-${index}`,
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
      <FormSectionHeader>
        <Text variant={TextVariant.Md} color={TextColor.Secondary}>
          Values
        </Text>
        <Clickable onClick={handleAddValue}>
          <FormFieldRow>
            <Icon name={IconName.Add} size={Size.Sm} />
            <Text variant={TextVariant.Sm}>Add value</Text>
          </FormFieldRow>
        </Clickable>
      </FormSectionHeader>
      {values.length === 0 ? (
        <div>
          <Input
            type={isNumeric ? "number" : "text"}
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              isNumeric
                ? "Enter a number and press Enter"
                : "Enter a value and press Enter"
            }
          />
          {!newValue && (
            <Text
              variant={TextVariant.Sm}
              color={TextColor.Secondary}
              style={{ marginTop: 8 }}
            >
              No values yet
            </Text>
          )}
        </div>
      ) : (
        <>
          <RichList
            listItems={valueListItems}
            draggable={true}
            onOrderChange={handleOrderChange}
          />
          <Input
            type={isNumeric ? "number" : "text"}
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isNumeric ? "Add another number" : "Add another value"}
            style={{ marginTop: 8 }}
          />
        </>
      )}
    </div>
  );
};

export default ValuesList;
