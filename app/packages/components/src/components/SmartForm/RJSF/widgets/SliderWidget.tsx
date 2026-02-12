/**
 * RJSF widget that wraps voodo's BaseSlider
 *
 * This provides slider behavior for number inputs in RJSF forms.
 * Supports both single value and multi-value (range) sliders.
 */

import { WidgetProps } from "@rjsf/utils";
import { BaseSlider, FormField } from "@voxel51/voodo";
import React from "react";

export default function Slider(props: WidgetProps) {
  const { value, onChange, schema, uiSchema, label, rawErrors } = props;

  // Extract min/max from schema
  const min = schema.minimum ?? 0;
  const max = schema.maximum ?? 100;
  const step = schema.multipleOf ?? 0.01;

  // Check if this should be a multi-value slider (range)
  // Multi-value if value is an array or if explicitly set in uiSchema
  const isMulti =
    Array.isArray(value) ||
    uiSchema?.["ui:options"]?.multi === true ||
    schema.type === "array";

  // Extract additional options from uiSchema
  const bare = uiSchema?.["ui:options"]?.bare ?? false;
  const labeled = uiSchema?.["ui:options"]?.labeled ?? false;
  const minLabel = uiSchema?.["ui:options"]?.minLabel;
  const maxLabel = uiSchema?.["ui:options"]?.maxLabel;

  const handleChange = (newValue: number | number[]) => {
    onChange(newValue);
  };

  const sliderComponent = (
    <BaseSlider
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={handleChange}
      multi={isMulti}
      bare={bare}
      labeled={labeled}
      knobLabel={false}
      minLabel={minLabel}
      maxLabel={maxLabel}
    />
  );

  return (
    <FormField
      control={sliderComponent}
      label={label}
      error={rawErrors && rawErrors.length > 0 ? rawErrors[0] : undefined}
    />
  );
}
