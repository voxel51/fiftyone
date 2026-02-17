/**
 * JSON editor widget using a textarea for dict/object values
 */

import { WidgetProps } from "@rjsf/utils";
import { FormField } from "@voxel51/voodo";
import React from "react";

export default function JsonEditorWidget(props: WidgetProps) {
  const {
    label,
    value,
    disabled,
    readonly,
    autofocus,
    onChange = () => {},
    placeholder,
  } = props;

  const handleChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(event.target.value);
  };

  const inputComponent = (
    <textarea
      disabled={disabled || readonly}
      autoFocus={autofocus}
      value={value ?? ""}
      placeholder={placeholder || "{}"}
      onChange={handleChange}
      rows={4}
      style={{
        width: "100%",
        fontFamily: "monospace",
        fontSize: "0.875rem",
        padding: "8px",
        borderRadius: "4px",
        border: "1px solid var(--fo-palette-divider)",
        backgroundColor: "var(--fo-palette-background-field)",
        color: "var(--fo-palette-text-primary)",
        resize: "vertical",
        boxSizing: "border-box",
      }}
    />
  );

  return <FormField control={inputComponent} label={label} />;
}
