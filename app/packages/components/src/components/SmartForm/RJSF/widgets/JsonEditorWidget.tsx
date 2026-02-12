/**
 * JSON editor widget using Code editor for dict/object values
 */

import { Code, scrollable } from "@fiftyone/components";
import { WidgetProps } from "@rjsf/utils";
import { FormField } from "@voxel51/voodo";
import React, { useEffect, useState } from "react";

const DEFAULT_HEIGHT = 200;
const ERROR_BORDER_STYLES =
  "1px solid color-mix(in srgb, var(--color-semantic-destructive) 40%, transparent)";

export default function JsonEditorWidget(props: WidgetProps) {
  const {
    label,
    value,
    disabled,
    readonly,
    onChange = () => {},
    rawErrors,
    uiSchema,
  } = props;
  const [localValue, setLocalValue] = useState("");
  const [hasErrors, setHasErrors] = useState(false);

  const height = uiSchema?.["ui:options"]?.height ?? DEFAULT_HEIGHT;

  useEffect(() => {
    setLocalValue(JSON.stringify(value, undefined, 2));
  }, [value]);

  const handleEditorChange = (editorValue: unknown) => {
    const strValue = editorValue as string;
    setLocalValue(strValue);

    try {
      const parsedValue = JSON.parse(strValue);
      onChange(parsedValue);
      setHasErrors(false);
    } catch (error) {
      // invalid JSON
      setHasErrors(true);
    }
  };

  const contentArea = (
    <div
      className={scrollable}
      style={{
        flex: 1,
        backgroundColor: "transparent",
        overflow: "auto",
        minHeight: height,
        border: hasErrors ? ERROR_BORDER_STYLES : undefined,
      }}
    >
      <Code
        defaultValue={localValue}
        onChange={handleEditorChange}
        language="json"
        height={`${height}px`}
        width="100%"
        readOnly={disabled || readonly}
        options={{
          // make editor as small as possible
          minimap: { enabled: false },
          lineNumbersMinChars: 2,
        }}
      />
    </div>
  );

  return (
    <FormField
      control={contentArea}
      label={label}
      error={hasErrors ? "Invalid JSON" : undefined}
    />
  );
}
