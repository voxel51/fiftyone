import { TextField, type TextFieldProps } from "@mui/material";
import { useKey } from "../hooks";
import { getComponentProps, getFieldSx } from "../utils";
import autoFocus from "../utils/auto-focus";
import { NumberSchemaType, ViewPropsType } from "../utils/types";
import FieldWrapper from "./FieldWrapper";

export default function TextFieldView(props: ViewPropsType<NumberSchemaType>) {
  const { schema, onChange, path, data } = props;
  const { type, view = {}, min, max, multipleOf = 1 } = schema;
  const {
    readOnly,
    placeholder,
    compact,
    label,
    color,
    variant,
    multiline,
    rows,
  } = view as {
    readOnly?: boolean;
    placeholder?: string;
    compact?: boolean;
    label?: string;
    color?: Parameters<typeof getFieldSx>[0]["color"];
    variant?: Parameters<typeof getFieldSx>[0]["variant"];
    multiline?: boolean;
    rows?: number;
  };

  const { inputProps = {}, ...fieldProps } = getComponentProps<
    Pick<TextFieldProps, "sx" | "inputProps">
  >(props, "field", {
    sx: getFieldSx({ color, variant }),
  });

  const [key, setUserChanged] = useKey(path, schema, data, true);

  return (
    <FieldWrapper {...props} hideHeader={compact}>
      <TextField
        key={key}
        disabled={readOnly}
        autoFocus={autoFocus(props)}
        defaultValue={data as string | number}
        size="small"
        fullWidth
        placeholder={compact ? placeholder || label : placeholder}
        type={type}
        multiline={multiline}
        rows={rows}
        onChange={(e) => {
          const value = e.target.value;
          onChange(path, type === "number" ? parseFloat(value) : value);
          setUserChanged();
        }}
        inputProps={{
          min,
          max,
          step: multipleOf,
          style: compact ? { padding: "0.45rem 1rem" } : {},
          ...inputProps,
        }}
        {...fieldProps}
      />
    </FieldWrapper>
  );
}
