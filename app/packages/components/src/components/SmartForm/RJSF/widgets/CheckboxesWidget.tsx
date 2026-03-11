/**
 * Checkboxes widget that renders a list of checkboxes from schema enum,
 * maps selected values back to the original enum types.
 */

import { WidgetProps } from "@rjsf/utils";
import {
  Checkbox,
  FormField,
  Orientation,
  Size,
  Spacing,
  Stack,
} from "@voxel51/voodo";
import React, { useCallback, useMemo } from "react";

interface Option {
  value: unknown;
  valueStr: string;
  label: string;
}

interface ItemsSchema {
  enum?: unknown[];
  enumNames?: string[];
}

export default function CheckboxesWidget(props: WidgetProps) {
  const {
    label,
    value: values = [], // use plural for internal cohesiveness
    disabled,
    readonly,
    onChange = () => {},
    schema,
    id,
  } = props;
  // SchemaIO puts enum/enumNames on schema.items
  const items = schema.items as ItemsSchema;
  const enumValues = items.enum || [];
  const enumNames = items.enumNames || enumValues;

  const isDisabled = disabled || readonly;

  const options = useMemo<Option[]>(
    () =>
      enumValues.map((val: unknown, index: number) => ({
        value: val,
        valueStr: String(val),
        label: String(enumNames[index] ?? val),
      })),
    [enumValues, enumNames]
  );

  // values is always an array of selected values (preserve original types)
  const validStringValues = useMemo(
    // handle strings, ints, etc.
    () => new Set((values ?? []).map((v: unknown) => String(v))),
    [values]
  );

  const handleToggle = useCallback(
    (optionValueStr: string, checked: boolean) => {
      if (isDisabled) return;
      const originalValue = enumValues.find(
        (v) => String(v) === optionValueStr
      );
      if (originalValue === undefined) return;

      // convert values to string for comparison
      const currentArr = [...(values ?? [])];
      const currentSet = new Set(currentArr.map((v) => String(v)));

      if (checked) {
        currentSet.add(optionValueStr);
      } else {
        currentSet.delete(optionValueStr);
      }

      // convert back to original types
      const newArr = enumValues.filter((v: unknown) =>
        currentSet.has(String(v))
      );
      onChange(newArr);
    },
    [isDisabled, enumValues, values, onChange]
  );

  const control = (
    <div
      style={{
        opacity: isDisabled ? 0.5 : 1,
        pointerEvents: isDisabled ? "none" : "auto",
      }}
    >
      <Stack orientation={Orientation.Column} spacing={Spacing.Sm}>
        {options.map((opt: Option) => (
          <Checkbox
            key={opt.valueStr}
            id={id ? `${id}-${opt.valueStr}` : undefined}
            name={id}
            label={opt.label}
            checked={validStringValues.has(opt.valueStr)}
            onChange={(checked) => handleToggle(opt.valueStr, checked)}
            disabled={isDisabled}
            size={Size.Md}
          />
        ))}
      </Stack>
    </div>
  );

  return <FormField control={control} label={label} />;
}
