/**
 * Custom FieldTemplate that matches SchemaIO's field label styling
 *
 * This ensures that RJSF field labels match the appearance of SchemaIO labels.
 */

import { FieldTemplateProps } from "@rjsf/utils";
import { Box, Typography } from "@mui/material";

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
    rawErrors,
  } = props;

  if (hidden) {
    return <div style={{ display: "none" }}>{children}</div>;
  }

  return (
    <Box
      className={classNames}
      style={style}
      sx={{
        marginBottom: 2,
        width: "100%",
      }}
    >
      {displayLabel && label && (
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
      {displayLabel && description && (
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
