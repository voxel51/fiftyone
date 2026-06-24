/**
 * JSON editor widget using Code editor for dict/object values
 */

import { Code, scrollable } from "@fiftyone/components";
import { WidgetProps } from "@rjsf/utils";
import { FormField } from "@voxel51/voodo";
import { useEffect, useState } from "react";

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
    uiSchema,
  } = props;
  const [localValue, setLocalValue] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const height = uiSchema?.["ui:options"]?.height ?? DEFAULT_HEIGHT;

  useEffect(() => {
    try {
      setLocalValue(JSON.stringify(value ?? {}, undefined, 2));
    } catch {
      setLocalValue("{}");
    }
  }, [value]);

  const handleEditorChange = (editorValue: unknown) => {
    const strValue = editorValue as string;
    setLocalValue(strValue);

    try {
      const parsedValue = JSON.parse(strValue);
      onChange(parsedValue);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Invalid JSON syntax"
      );
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
        border: errorMessage ? ERROR_BORDER_STYLES : undefined,
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
      error={errorMessage ?? undefined}
    />
  );
}
