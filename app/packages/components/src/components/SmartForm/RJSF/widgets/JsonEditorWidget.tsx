/**
 * JSON editor widget using a textarea for dict/object values.
 * Validates JSON on blur and surfaces parse errors inline.
 */

import { WidgetProps } from "@rjsf/utils";
import { FormField } from "@voxel51/voodo";
import React, { useCallback, useEffect, useState } from "react";

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

  const [rawValue, setRawValue] = useState<string>(value ?? "");
  const [jsonError, setJsonError] = useState<string | null>(null);

  useEffect(() => {
    setRawValue(value ?? "");
  }, [value]);

  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      const text = event.target.value;
      setRawValue(text);
      if (jsonError) {
        setJsonError(null);
      }
    },
    [jsonError]
  );

  const handleBlur = useCallback(() => {
    const trimmed = rawValue.trim();
    if (trimmed === "") {
      onChange(undefined);
      setJsonError(null);
      return;
    }
    try {
      const parsed = JSON.parse(trimmed);
      if (
        typeof parsed !== "object" ||
        parsed === null ||
        Array.isArray(parsed)
      ) {
        setJsonError("Value must be a JSON object (dict), e.g. {}");
        return;
      }
      setJsonError(null);
      onChange(trimmed);
    } catch (e) {
      setJsonError((e as SyntaxError).message);
    }
  }, [rawValue, onChange]);

  const borderColor = jsonError
    ? "var(--fo-palette-error-main, #d32f2f)"
    : "var(--fo-palette-divider)";

  const inputComponent = (
    <div>
      <textarea
        disabled={disabled || readonly}
        autoFocus={autofocus}
        value={rawValue}
        placeholder={placeholder || "{}"}
        onChange={handleChange}
        onBlur={handleBlur}
        rows={4}
        style={{
          width: "100%",
          fontFamily: "monospace",
          fontSize: "0.875rem",
          padding: "8px",
          borderRadius: "4px",
          border: `1px solid ${borderColor}`,
          backgroundColor: "var(--fo-palette-background-field)",
          color: "var(--fo-palette-text-primary)",
          resize: "vertical",
          boxSizing: "border-box",
        }}
      />
      {jsonError && (
        <div
          style={{
            color: "var(--fo-palette-error-main, #d32f2f)",
            fontSize: "0.75rem",
            marginTop: "4px",
          }}
        >
          Invalid JSON: {jsonError}
        </div>
      )}
    </div>
  );

  return <FormField control={inputComponent} label={label} />;
}
