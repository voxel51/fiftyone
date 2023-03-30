import React, { ChangeEvent, FocusEvent } from "react";
import {
  Box,
  Button,
  Grid,
  Typography,
  TextField,
  Slider as MUISlider,
  Switch as MUISwitch,
  FormControl,
  Radio,
  RadioGroup,
  FormControlLabel,
  FormLabel,
} from "@mui/material";
import {
  getInputProps,
  ArrayFieldTemplateProps,
  ObjectFieldTemplateProps,
  BaseInputTemplateProps,
} from "@rjsf/utils";

function ArrayFieldTemplate(props: ArrayFieldTemplateProps) {
  const { ArrayFieldItemTemplate } = props.registry.templates;
  const { title, canAdd, items, onAddClick } = props;
  return (
    <Box>
      <Grid
        container
        sx={{
          pb: 2,
          borderBottom: "1px solid",
          borderColor: (theme) => theme.palette.divider,
        }}
      >
        <Grid item xs={8}>
          <Typography variant="h6">{title}</Typography>
        </Grid>

        <Grid item xs={4} sx={{ textAlign: "right" }}>
          {canAdd && (
            <Button variant="contained" onClick={onAddClick}>
              Add
            </Button>
          )}
        </Grid>
      </Grid>
      {items.length === 0 && (
        <Typography sx={{ p: 4, textAlign: "center" }}>
          No {title.toLowerCase()} yet
        </Typography>
      )}
      {items.map((item) => (
        <ArrayFieldItemTemplate {...item} disabled={false} />
      ))}
    </Box>
  );
}

function ObjectFieldTemplate(props: ObjectFieldTemplateProps) {
  const { title, description, uiSchema } = props;
  const { spaces = [] } = uiSchema;
  console.log({ spaces });
  return (
    <Box>
      <Box sx={{ pb: 2 }}>
        <Typography variant="h6">{title}</Typography>
        {description && <Typography variant="body1">{description}</Typography>}
      </Box>
      <Grid container spacing={1}>
        {props.properties.map((element, i) => (
          <Grid item xs={spaces[i] || 12}>
            {element.content}
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}

function BaseInputTemplate(props: BaseInputTemplateProps) {
  const {
    schema,
    id,
    options,
    label,
    value,
    type,
    placeholder,
    required,
    disabled,
    readonly,
    autofocus,
    onChange,
    onChangeOverride,
    onBlur,
    onFocus,
    rawErrors,
    hideError,
    uiSchema,
    registry,
    formContext,
    ...rest
  } = props;
  const onTextChange = ({
    target: { value: val },
  }: ChangeEvent<HTMLInputElement>) => {
    // Use the options.emptyValue if it is specified and newVal is also an empty string
    onChange(val === "" ? options.emptyValue || "" : val);
  };
  const onTextBlur = ({
    target: { value: val },
  }: FocusEvent<HTMLInputElement>) => onBlur(id, val);
  const onTextFocus = ({
    target: { value: val },
  }: FocusEvent<HTMLInputElement>) => onFocus(id, val);

  const inputProps = { ...rest, ...getInputProps(schema, type, options) };
  const hasError = rawErrors?.length > 0 && !hideError;
  console.log({ rawErrors });

  return (
    <Box>
      <TextField
        fullWidth
        id={id}
        required={required}
        value={value}
        placeholder={placeholder || label}
        disabled={disabled}
        autoFocus={autofocus}
        error={hasError}
        // errors={hasError ? rawErrors : undefined}
        onChange={onChangeOverride || onTextChange}
        onBlur={onTextBlur}
        onFocus={onTextFocus}
        InputProps={{ readOnly: readonly }}
        size="small"
        {...inputProps}
      />
    </Box>
  );
}

export function Slider(props) {
  const { onChange } = props;
  console.log({ props });
  return (
    <MUISlider
      valueLabelDisplay="auto"
      onChange={(e, value) => {
        onChange(value);
      }}
    />
  );
}

export function Switch(props) {
  const { onChange } = props;
  console.log({ props });
  return (
    <MUISwitch
      onChange={(e, value) => {
        onChange(value);
      }}
    />
  );
}

export default function RadioButtonsGroup(props) {
  console.log(props);
  return (
    <FormControl>
      <FormLabel id={props.id}>Gender</FormLabel>
      <RadioGroup
        defaultValue={props.value}
        onChange={(e, value) => {
          props.onChange(value);
        }}
        row
      >
        {props.options.enumOptions.map(({ label, value }) => (
          <FormControlLabel value={value} control={<Radio />} label={label} />
        ))}
      </RadioGroup>
    </FormControl>
  );
}

export const templates = {
  ArrayFieldTemplate,
  ObjectFieldTemplate,
  BaseInputTemplate,
};

export const widgets = {
  Slider,
  radio: RadioButtonsGroup,
  // Switch,
};
