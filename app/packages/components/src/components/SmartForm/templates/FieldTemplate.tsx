/**
 * Custom FieldTemplate that matches SchemaIO's field label styling
 *
 * This ensures that RJSF field labels match the appearance of SchemaIO labels.
 * For custom SchemaIO widgets (Dropdown, AutoComplete), labels are hidden here
 * since those widgets handle their own labels via FieldWrapper.
 */

import { FieldTemplateProps } from "@rjsf/utils";
import { Box, Typography } from "@mui/material";

// Custom SchemaIO widgets that handle their own labels
const SCHEMAIO_WIDGETS = ["AutoComplete", "Dropdown"];

export default function FieldTemplate(props: FieldTemplateProps) {
  const {
    id,
    classNames,
    style,
    label,
    help,
    required,
    description,
    errors,
    children,
    displayLabel,
    hidden,
    uiSchema,
  } = props;

  if (hidden) {
    return <div style={{ display: "none" }}>{children}</div>;
  }

  // Check if this field is using a custom SchemaIO widget
  const widget = uiSchema?.["ui:widget"];
  const isSchemaIOWidget = typeof widget === "string" && SCHEMAIO_WIDGETS.includes(widget);

  // For SchemaIO widgets, don't render the label here (they handle it themselves)
  const shouldShowLabel = displayLabel && label && !isSchemaIOWidget;

  return (
    <Box
      className={classNames}
      style={style}
      sx={{
        marginBottom: 2,
        width: "100%",
      }}
    >
      {shouldShowLabel && (
        <Typography
          component="label"
          htmlFor={id}
          variant="body1"
          color="text.primary"
          sx={{
            display: "block",
            marginBottom: 1,
            fontWeight: 400,
          }}
        >
          {label}
          {required && (
            <span style={{ color: "error.main", marginLeft: "4px" }}>*</span>
          )}
        </Typography>
      )}
      {shouldShowLabel && description && (
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{
            marginBottom: 1,
          }}
        >
          {description}
        </Typography>
      )}
      {children}
      {errors && (
        <Typography
          variant="body2"
          color="error"
          sx={{
            marginTop: 0.5,
          }}
        >
          {errors}
        </Typography>
      )}
      {help && (
        <Typography
          variant="body2"
          color="text.tertiary"
          sx={{
            marginTop: 0.5,
          }}
        >
          {help}
        </Typography>
      )}
    </Box>
  );
}
