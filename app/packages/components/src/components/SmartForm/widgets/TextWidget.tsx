/**
 * Custom text widget that doesn't render its own label
 *
 * The FieldTemplate handles labels, so we only render the input field.
 */

import { WidgetProps } from "@rjsf/utils";
import { TextField } from "@mui/material";

export default function TextWidget(props: WidgetProps) {
  const {
    id,
    value,
    disabled,
    readonly,
    autofocus,
    onChange,
    onBlur,
    onFocus,
    options,
    placeholder,
    schema,
    rawErrors = [],
  } = props;

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onChange(event.target.value === "" ? options.emptyValue : event.target.value);
  };

  const handleBlur = (event: React.FocusEvent<HTMLInputElement>) => {
    onBlur(id, event.target.value);
  };

  const handleFocus = (event: React.FocusEvent<HTMLInputElement>) => {
    onFocus(id, event.target.value);
  };

  return (
    <TextField
      id={id}
      value={value || ""}
      placeholder={placeholder}
      disabled={disabled || readonly}
      autoFocus={autofocus}
      error={rawErrors.length > 0}
      onChange={handleChange}
      onBlur={handleBlur}
      onFocus={handleFocus}
      fullWidth
      size="small"
      // No label prop - FieldTemplate handles labels
    />
  );
}
