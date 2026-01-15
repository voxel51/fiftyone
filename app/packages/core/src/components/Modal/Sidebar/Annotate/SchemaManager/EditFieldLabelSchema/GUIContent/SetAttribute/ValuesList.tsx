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
import { createRichListItem, type RichListItem } from "../../../utils";

interface ValuesListProps {
  values: string[];
  onValuesChange: (values: string[]) => void;
}

const ValuesList = ({ values, onValuesChange }: ValuesListProps) => {
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
    const newValues = newItems.map((item) => {
      const index = parseInt(item.id.replace("values-", ""), 10);
      return values[index];
    });
    onValuesChange(newValues);
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <Text variant={TextVariant.Md} color={TextColor.Secondary}>
          Values
        </Text>
        <Clickable
          onClick={handleAddValue}
          style={{ display: "flex", alignItems: "center", gap: 4 }}
        >
          <Icon name={IconName.Add} size={Size.Sm} />
          <Text variant={TextVariant.Sm}>Add value</Text>
        </Clickable>
      </div>
      {values.length === 0 ? (
        <div style={{ textAlign: "center" }}>
          <Input
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Enter a value and press Enter"
          />
          {values.length === 0 && !newValue && (
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
            style={{ gap: 8 }}
          />
          <div style={{ marginTop: 8 }}>
            <Input
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Add another value"
            />
          </div>
        </>
      )}
    </div>
  );
};

export default ValuesList;
